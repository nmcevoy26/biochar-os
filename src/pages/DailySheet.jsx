import { useState, useEffect, useRef } from 'react'
import { supabase, MACHINES, detectShift, todayISO } from '../lib/supabase'
import { enqueue, dequeueOps } from '../lib/offline'
import ToggleGroup from '../components/ToggleGroup'
import Toggle from '../components/Toggle'
import NumberInput from '../components/NumberInput'
import SaveConfirmation from '../components/SaveConfirmation'
import WoodVinegarSection from '../components/WoodVinegarSection'
import { validateDailySheet, validateBags, hasHardIssue } from '../lib/dailySheetValidation'

const NEW_WV_BATCH = '__new__'

// Fixed reason set for downtime_reason. Stored as plain text in the DB —
// changing this list does not require a migration. Order is the order
// operators see in the dropdown.
const DOWNTIME_REASONS = [
  'Planned maintenance',
  'Mechanical failure / breakdown',
  'Feed jam / blockage',
  'No feedstock available',
  'Weather / environmental',
  'Power / utility outage',
  'Operator unavailable',
  'Other',
]

const EMPTY_BAG = {
  bulk_bag_id: '',
  wet_weight_kg: '',
  moisture_pct: '',
  volume_m3: 1,
  subsample_taken: false,
}

// Pure helpers for client-side allocation of new WV batch identifiers. Both
// scan the in-memory batch list (loaded at mount + refreshed after every
// queue drain), apply strict regex matching so legacy non-canonical values
// are ignored, and return the next-highest number formatted canonically.
// Allocating client-side avoids a Supabase round-trip during the offline-
// autosave path that this PR's structural fix relies on.
function allocateNextBatchId(batches) {
  let max = 0
  for (const b of batches) {
    const m = b?.batch_id?.match(/^WV(\d{3})$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `WV${String(max + 1).padStart(3, '0')}`
}

function allocateNextIbcLocation(batches) {
  let max = 0
  for (const b of batches) {
    const m = b?.location?.match(/^IBC#(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `IBC#${max + 1}`
}

// Pure status derivation for the header indicator. Listed in priority order:
// transient states (saving, hard failure) win over steady states. Tailwind
// class names must appear as full string literals so the JIT picks them up.
function getSaveStatus({ saving, online, dirty, queueCount, autoSaveFailCount, lastSavedAt }) {
  if (saving && online) {
    return { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Saving…' }
  }
  if (autoSaveFailCount >= 3) {
    return { dot: 'bg-red-500', text: 'text-red-600', label: 'Save failed — try manual save' }
  }
  if (!online && (dirty || queueCount > 0)) {
    return { dot: 'bg-blue-400', text: 'text-blue-600', label: 'Saved locally — will sync' }
  }
  if (online && queueCount > 0) {
    return { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Syncing…' }
  }
  if (dirty && online) {
    return { dot: 'bg-orange-400', text: 'text-orange-600', label: 'Unsaved changes' }
  }
  if (lastSavedAt && online && queueCount === 0) {
    return {
      dot: 'bg-green-500',
      text: 'text-gray-500',
      label: `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    }
  }
  return null
}

export default function DailySheet({ online, operator: loggedInOperator, queueCount = 0, onQueueChange }) {
  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState(detectShift())
  const [machineKey, setMachineKey] = useState(
    () => localStorage.getItem('grip_last_machine') || 'CP500'
  )
  const [operatorName, setOperatorName] = useState(loggedInOperator?.name || '')
  const [feedstockSources, setFeedstockSources] = useState([])
  const [selectedFeedstock, setSelectedFeedstock] = useState('')
  const [feedstockStartWeight, setFeedstockStartWeight] = useState('')
  const [feedstockEndWeight, setFeedstockEndWeight] = useState('')
  const [feedstockMoisture, setFeedstockMoisture] = useState('')
  const [runtimeHours, setRuntimeHours] = useState('')
  const [downtimeHours, setDowntimeHours] = useState('')
  const [downtimeReason, setDowntimeReason] = useState('')
  const [dieselLitres, setDieselLitres] = useState('')
  const [avgPyroTemp, setAvgPyroTemp] = useState('')
  const [maxPyroTemp, setMaxPyroTemp] = useState('')
  const [avgExhaustTemp, setAvgExhaustTemp] = useState('')
  const [thermalOutput, setThermalOutput] = useState('')
  const [notes, setNotes] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [bags, setBags] = useState([])
  const [nextBagNum, setNextBagNum] = useState(1)
  const [addingBag, setAddingBag] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(null)
  const [existingId, setExistingId] = useState(null)
  // isPersisted = "this daily_production row has been (or is queued to be)
  // written to the DB." Drives the phantom-row gate in handleSave: until
  // meaningful production data is entered, we don't INSERT just because the
  // sheet was opened and a field was touched. Set true when load finds an
  // existing row, or after the first successful save/enqueue this session.
  const [isPersisted, setIsPersisted] = useState(false)
  const [dirty, setDirty] = useState(false)
  // dirtyTick bumps on every edit so the autosave effect's debounce timer
  // resets per keystroke. Using `dirty` as the dep doesn't work — once it's
  // true, subsequent setDirty(true) calls don't re-run the effect, so the
  // timer never resets and save fires while the operator is still typing
  // (the original mid-type erase race). Keep `dirty` boolean for the UI
  // status indicator; only use dirtyTick to drive the timer.
  const [dirtyTick, setDirtyTick] = useState(0)
  const [flashIdx, setFlashIdx] = useState(null)
  const [readingsOpen, setReadingsOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [autoSaveFailCount, setAutoSaveFailCount] = useState(0)
  const handleSaveRef = useRef(null)

  // Wood vinegar (CP500 only). wvBatches holds ALL batches (any status) so
  // location allocation considers closed/dispatched IBC numbers and avoids
  // recycling them. The dropdown render site filters to status='open' for
  // the existing-batch picker.
  const [wvCollected, setWvCollected] = useState(false)
  const [wvBatches, setWvBatches] = useState([])
  const [wvBatchChoice, setWvBatchChoice] = useState('')
  const [wvNewBatch, setWvNewBatch] = useState(null) // { id, batch_id, location } when operator is creating a new batch
  const [wvVolume, setWvVolume] = useState('')
  const [wvNotes, setWvNotes] = useState('')
  const [wvCloseBatch, setWvCloseBatch] = useState(false)
  const [wvExistingFillId, setWvExistingFillId] = useState(null)
  // wvFillPersisted = "the current wvExistingFillId corresponds to a row that
  // exists in the DB (or is queued to be written)." Gates whether
  // removeWvFill actually issues a DELETE vs. just resetting local state —
  // mirrors the `bag._saved` pattern. Set true on load when an existing fill
  // is found, and after every successful save/enqueue of the fill. Cleared
  // by resetWoodVinegar and removeWvFill.
  const [wvFillPersisted, setWvFillPersisted] = useState(false)
  const [wvErrors, setWvErrors] = useState({})

  const machineId = MACHINES[machineKey]
  const isCP500 = machineKey === 'CP500'

  function resetWoodVinegar() {
    setWvCollected(false)
    setWvBatchChoice('')
    setWvNewBatch(null)
    setWvVolume('')
    setWvNotes('')
    setWvCloseBatch(false)
    setWvExistingFillId(null)
    setWvFillPersisted(false)
    setWvErrors({})
  }

  // Explicit delete for the current WV fill. Two UI affordances call this:
  // the "collected" toggle going OFF (when a fill was persisted), and the
  // ✕ Remove button on the saved-fill list. Mirrors removeBag: optimistic UI
  // clear, drop any pending queued upsert for the same id, then DELETE
  // online (or enqueue DELETE offline). The DB CHECK + RLS + GRANT for anon
  // were configured in migrations
  // wood_vinegar_fills_operator_app_delete +
  // wood_vinegar_fills_grant_delete_to_anon.
  async function removeWvFill() {
    const fillId = wvExistingFillId
    const wasPersisted = wvFillPersisted

    if (fillId) {
      const dropped = dequeueOps(
        (op) =>
          op.table === 'wood_vinegar_fills' &&
          (op.data?.id === fillId || op.match?.id === fillId),
      )
      if (dropped > 0) onQueueChange?.()
    }

    resetWoodVinegar()

    if (!wasPersisted || !fillId) return

    if (online) {
      const { error } = await supabase
        .from('wood_vinegar_fills')
        .delete()
        .eq('id', fillId)
      if (error) {
        // UI has already cleared optimistically but the row may still be in
        // the DB. Tell the operator explicitly — a bare error.message would
        // imply the local clear meant the delete succeeded. Refresh batches
        // so the dropdown reflects current DB truth either way.
        alert('Delete failed — the fill may still be recorded. Refresh to confirm.\n\n' + error.message)
      }
      const { data: refreshed } = await supabase
        .from('v_wood_vinegar_batches')
        .select('*')
        .order('batch_id')
      if (refreshed) setWvBatches(refreshed)
    } else {
      enqueue({
        table: 'wood_vinegar_fills',
        type: 'delete',
        match: { id: fillId },
      })
      onQueueChange?.()
    }
  }

  // Load feedstock sources
  useEffect(() => {
    supabase
      .from('feedstock_sources')
      .select('id, source_name')
      .order('source_name')
      .then(({ data }) => {
        if (data) setFeedstockSources(data)
      })
  }, [])

  // Load next bag number
  useEffect(() => {
    supabase
      .from('bulk_bags')
      .select('bulk_bag_id')
      .order('bulk_bag_id', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          const num = parseInt(data[0].bulk_bag_id.replace(/\D/g, ''), 10)
          if (!isNaN(num)) setNextBagNum(num + 1)
        }
      })
  }, [])

  // Load all wood vinegar batches (CP500 only). No status filter — the
  // dropdown render site filters to status='open' for the picker, but
  // allocation needs to see closed/dispatched batches too so we don't
  // recycle their IBC numbers (physical tank labels persist after closure).
  useEffect(() => {
    if (!isCP500) return
    supabase
      .from('v_wood_vinegar_batches')
      .select('*')
      .order('batch_id')
      .then(({ data }) => {
        if (data) setWvBatches(data)
      })
  }, [isCP500])

  // Clear wood vinegar UI when switching to CP1000
  useEffect(() => {
    if (!isCP500) resetWoodVinegar()
  }, [isCP500])

  // Pre-allocate the wood vinegar fill UUID the moment the operator toggles
  // "collected" on, so subsequent autosaves (offline or online) target the
  // same row instead of generating a fresh id each cycle. Without this every
  // offline autosave would silently INSERT a duplicate fill — wood_vinegar_fills
  // has no business-key unique constraint to catch dupes.
  useEffect(() => {
    if (isCP500 && wvCollected && !wvExistingFillId) {
      setWvExistingFillId(crypto.randomUUID())
    }
  }, [isCP500, wvCollected, wvExistingFillId])

  // Load existing production record for this date/shift/machine
  useEffect(() => {
    if (!date || !shift || !machineId) return
    supabase
      .from('daily_production')
      .select('*')
      .eq('date', date)
      .eq('shift', shift)
      .eq('machine_id', machineId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id)
          setIsPersisted(true)
          setOperatorName(data.operator || loggedInOperator?.name || '')
          setFeedstockStartWeight(data.feedstock_start_weight_t ?? '')
          setFeedstockEndWeight(data.feedstock_end_weight_t ?? '')
          setFeedstockMoisture(data.feedstock_moisture_pct ?? '')
          setRuntimeHours(data.runtime_hours ?? '')
          setDowntimeHours(data.downtime_hours ?? '')
          setDowntimeReason(data.downtime_reason ?? '')
          setDieselLitres(data.diesel_litres ?? '')
          setAvgPyroTemp(data.avg_pyrolysis_temp_c ?? '')
          setMaxPyroTemp(data.max_pyrolysis_temp_c ?? '')
          setAvgExhaustTemp(data.avg_exhaust_temp_c ?? '')
          setThermalOutput(data.thermal_output_kwh ?? '')
          setNotes(data.notes || '')
          setMaintenanceNotes(data.maintenance_notes || '')
          // Load feedstock links
          supabase
            .from('daily_production_feedstock')
            .select('feedstock_id')
            .eq('production_id', data.id)
            .then(({ data: links }) => {
              if (links?.length) setSelectedFeedstock(links[0].feedstock_id)
            })
          // Load bags
          supabase
            .from('bulk_bags')
            .select('*')
            .eq('production_id', data.id)
            .order('bulk_bag_id')
            .then(({ data: bagData }) => {
              if (bagData) setBags(bagData.map((b) => ({ ...b, _saved: true })))
            })
          // Load existing wood vinegar fill (CP500 only, single-fill UX)
          if (machineKey === 'CP500') {
            supabase
              .from('wood_vinegar_fills')
              .select('id, batch_id, volume_liters, notes')
              .eq('production_id', data.id)
              .order('created_at', { ascending: true })
              .limit(1)
              .then(({ data: fillData }) => {
                if (fillData?.[0]) {
                  const f = fillData[0]
                  setWvCollected(true)
                  setWvBatchChoice(f.batch_id)
                  setWvVolume(f.volume_liters ?? '')
                  setWvNotes(f.notes || '')
                  setWvExistingFillId(f.id)
                  setWvFillPersisted(true)
                } else {
                  resetWoodVinegar()
                }
              })
          } else {
            resetWoodVinegar()
          }
        } else {
          // No row in the DB for this date/shift/machine yet — pre-allocate a
          // stable UUID so the form has an identity from the moment of editing.
          // The first save (online or via queue drain) inserts this exact id;
          // every subsequent save upserts onto the same row. isPersisted stays
          // false until the operator enters meaningful data and the first save
          // fires — that's the phantom-row gate in handleSave.
          setExistingId(crypto.randomUUID())
          setIsPersisted(false)
          setOperatorName(loggedInOperator?.name || '')
          setFeedstockStartWeight('')
          setFeedstockEndWeight('')
          setFeedstockMoisture('')
          setRuntimeHours('')
          setDowntimeHours('')
          setDowntimeReason('')
          setDieselLitres('')
          setAvgPyroTemp('')
          setMaxPyroTemp('')
          setAvgExhaustTemp('')
          setThermalOutput('')
          setNotes('')
          setMaintenanceNotes('')
          setSelectedFeedstock('')
          setBags([])
          resetWoodVinegar()
        }
        setDirty(false)
      })
  }, [date, shift, machineId])

  // Remember last machine
  useEffect(() => {
    localStorage.setItem('grip_last_machine', machineKey)
  }, [machineKey])

  function markDirty() {
    setDirty(true)
    setDirtyTick((t) => t + 1)
  }

  // Save-on-blur for text fields. Free-text inputs (operator, maintenance
  // notes, notes, bag IDs, WV notes) don't ride the 5s debounce — they
  // save the instant the operator leaves the field, so autosave never
  // fires while the operator is still typing. Gated on `dirty` so blur
  // events on untouched fields are no-ops; gated on `saving` and
  // autoSaveFailCount to mirror the autosave effect's guards.
  function handleTextBlur() {
    if (!dirty || saving || autoSaveFailCount >= 3) return
    handleSaveRef.current({ silent: true })
      .then(() => setAutoSaveFailCount(0))
      .catch((err) => {
        console.error('Blur save failed', err)
        setAutoSaveFailCount((c) => c + 1)
      })
  }

  function selectFeedstock(id) {
    setSelectedFeedstock(id)
    markDirty()
  }

  async function addBag() {
    if (addingBag) return
    setAddingBag(true)
    // Re-query the DB at click time so concurrent fills from other devices
    // (or sessions left open across shifts) don't produce stale bag numbers.
    let baseNum = nextBagNum
    if (online) {
      const { data, error } = await supabase
        .from('bulk_bags')
        .select('bulk_bag_id')
        .order('bulk_bag_id', { ascending: false })
        .limit(1)
      if (!error && data?.[0]) {
        const n = parseInt(data[0].bulk_bag_id.replace(/\D/g, ''), 10)
        if (!isNaN(n)) baseNum = n + 1
      }
      setNextBagNum(baseNum)
    }
    const unsavedCount = bags.filter((b) => !b._saved).length
    const bagId = 'GRIP' + String(baseNum + unsavedCount).padStart(5, '0')
    // Pre-allocate the bag's UUID client-side so every save (offline or
    // online) targets the same row, no matter how many times autosave fires.
    setBags((prev) => [...prev, { ...EMPTY_BAG, id: crypto.randomUUID(), bulk_bag_id: bagId }])
    markDirty()
    setAddingBag(false)
    // Scroll to bottom after render
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100)
  }

  function updateBag(index, field, value) {
    setBags((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
    markDirty()
  }

  function removeBag(index) {
    const bag = bags[index]
    if (bag._saved && !confirm('Remove this saved bag?')) return

    // Optimistic: remove from UI immediately
    setBags((prev) => prev.filter((_, i) => i !== index))
    markDirty()

    // Drop any pending queued op for this bag — covers the "added offline then
    // removed before sync" case so a stale upsert can't recreate the bag on
    // the next drain.
    if (bag.id) {
      const dropped = dequeueOps(
        (op) =>
          op.table === 'bulk_bags' &&
          (op.data?.id === bag.id || op.match?.id === bag.id),
      )
      if (dropped > 0) onQueueChange?.()
    }

    // Delete from Supabase in background if already persisted to the DB
    if (bag._saved && bag.id) {
      supabase
        .from('bulk_bags')
        .delete()
        .eq('id', bag.id)
        .then(({ error }) => {
          if (error) {
            // Rollback: re-insert bag at original position
            setBags((prev) => {
              const restored = [...prev]
              restored.splice(index, 0, bag)
              return restored
            })
            alert('Failed to delete bag: ' + error.message)
          }
        })
    }
  }

  function validateWoodVinegar() {
    if (!isCP500 || !wvCollected) return {}
    const errs = {}
    if (wvBatchChoice === '') errs.batch = 'Select a batch or start a new one.'
    if (wvVolume === '' || Number(wvVolume) <= 0) errs.volume = 'Volume must be greater than 0.'
    return errs
  }

  // Phantom-row gate. Returns true when the form holds production-relevant
  // data worth persisting a daily_production row for. Used by handleSave to
  // suppress the first INSERT until the operator has actually started a run
  // — opening the sheet, picking a shift, or typing a name shouldn't write.
  // Once a row is persisted (isPersisted=true) this gate no longer applies:
  // subsequent edits, including clearing the form, save through normally.
  function hasMeaningfulData() {
    if (feedstockStartWeight !== '') return true
    if (feedstockEndWeight !== '') return true
    if (feedstockMoisture !== '') return true
    if (selectedFeedstock !== '') return true
    if (bags.length > 0) return true
    // Downtime is meaningful production data — a down-shift with no biochar
    // output is exactly when the downtime fields ARE the meaningful record.
    // Without these triggers, an operator who only logs downtime would have
    // no daily_production row created and their entry would silently no-save.
    if (downtimeHours !== '') return true
    if (downtimeReason !== '') return true
    if (isCP500 && wvCollected && wvBatchChoice !== '' && wvVolume !== '' && Number(wvVolume) > 0) return true
    return false
  }

  // Hard/warn validation for the current form state. Mirrors the dashboard's
  // rules (see lib/dailySheetValidation). Computed both at save time (to gate
  // the write) and in render (to drive field cues + the issue banner).
  function getValidationIssues() {
    return [
      ...validateDailySheet({
        feedstock_start_weight_t: feedstockStartWeight,
        feedstock_end_weight_t: feedstockEndWeight,
        feedstock_moisture_pct: feedstockMoisture,
        runtime_hours: runtimeHours,
        downtime_hours: downtimeHours,
        diesel_litres: dieselLitres,
        avg_pyrolysis_temp_c: avgPyroTemp,
        max_pyrolysis_temp_c: maxPyroTemp,
        avg_exhaust_temp_c: avgExhaustTemp,
        thermal_output_kwh: thermalOutput,
      }),
      ...validateBags(bags),
    ]
  }

  async function handleSave({ silent = false } = {}) {
    // Hard validation gate — block the save (and any DB write) before an
    // impossible value can reach the CHECK constraints as a raw Postgres
    // error. Autosave aborts silently and leaves the form dirty so the
    // operator can correct; manual save surfaces the first hard message.
    const validationIssues = getValidationIssues()
    if (hasHardIssue(validationIssues)) {
      if (!silent) {
        const first = validationIssues.find((i) => i.severity === 'hard')
        alert(first.message)
      }
      return
    }

    const wvErrs = validateWoodVinegar()
    const wvValid = Object.keys(wvErrs).length === 0
    if (!wvValid && !silent) {
      // Manual save with incomplete WV — surface the errors and abort
      // so the operator can fix them.
      setWvErrors(wvErrs)
      return
    }

    // Phantom-row gate: if the row hasn't been persisted yet AND no
    // meaningful data has been entered, skip the save entirely. setDirty(false)
    // settles the autosave cycle via the effect's cleanup (the still-pending
    // 5s timer, if any, gets cleared when the dep changes). The operator can
    // type their name, toggle shift/machine, and close the app without ever
    // creating an empty daily_production row.
    if (!isPersisted && !hasMeaningfulData()) {
      setDirty(false)
      return
    }
    // Silent autosave falls through with wvValid=false, skipping just
    // the WV section below. Without this, an in-progress WV section
    // would block daily_production/bag saves entirely — and because
    // dirty stays true while the autosave effect's deps don't change,
    // a single bailed cycle would freeze autosave for the rest of the
    // session.

    setSaving(true)
    try {
      const productionData = {
        date,
        shift,
        machine_id: machineId,
        operator: operatorName || null,
        operator_id: loggedInOperator?.id || null,
        feedstock_start_weight_t: feedstockStartWeight === '' ? null : Number(feedstockStartWeight),
        feedstock_end_weight_t: feedstockEndWeight === '' ? null : Number(feedstockEndWeight),
        feedstock_moisture_pct: feedstockMoisture === '' ? null : Number(feedstockMoisture),
        runtime_hours: runtimeHours === '' ? null : Number(runtimeHours),
        downtime_hours: downtimeHours === '' ? null : Number(downtimeHours),
        downtime_reason: downtimeReason || null,
        diesel_litres: dieselLitres === '' ? null : Number(dieselLitres),
        avg_pyrolysis_temp_c: avgPyroTemp === '' ? null : Number(avgPyroTemp),
        max_pyrolysis_temp_c: maxPyroTemp === '' ? null : Number(maxPyroTemp),
        avg_exhaust_temp_c: avgExhaustTemp === '' ? null : Number(avgExhaustTemp),
        thermal_output_kwh: thermalOutput === '' ? null : Number(thermalOutput),
        notes: notes || null,
        maintenance_notes: maintenanceNotes || null,
        updated_at: new Date().toISOString(),
      }

      if (!online) {
        // Every offline write is an upsert keyed on the client-allocated id.
        // Coalescing in enqueue keeps the queue at one op per logical record
        // even when autosave fires repeatedly, so replay on reconnect is
        // idempotent and the unique constraint on (machine_id, date, shift)
        // never trips.
        enqueue({
          table: 'daily_production',
          type: 'upsert',
          data: { ...productionData, id: existingId },
          onConflict: 'id',
        })
        for (const bag of bags) {
          enqueue({
            table: 'bulk_bags',
            type: 'upsert',
            data: {
              id: bag.id,
              bulk_bag_id: bag.bulk_bag_id,
              fill_date: date,
              shift,
              machine_id: machineId,
              production_id: existingId,
              operator_id: loggedInOperator?.id || null,
              wet_weight_kg: bag.wet_weight_kg === '' ? null : Number(bag.wet_weight_kg),
              moisture_pct: bag.moisture_pct === '' ? null : Number(bag.moisture_pct),
              volume_m3: bag.volume_m3 === '' ? null : Number(bag.volume_m3),
              subsample_taken: bag.subsample_taken || false,
              updated_at: new Date().toISOString(),
            },
            onConflict: 'id',
          })
        }
        // Wood vinegar offline. New-batch creation is now offline-safe:
        // wvNewBatch carries a pre-allocated UUID + canonical batch_id +
        // canonical IBC#N location set synchronously when the operator
        // picked "+ Start new batch". We enqueue the batch upsert FIRST so
        // the fill's foreign-key target exists by the time the queue drains.
        // wvExistingFillId is pre-allocated when wvCollected toggles on, so
        // the fill upsert is idempotent across autosave cycles too.
        if (wvValid && isCP500 && wvCollected && wvBatchChoice) {
          const isNewBatch = wvBatchChoice === NEW_WV_BATCH && wvNewBatch
          const fillBatchId = isNewBatch ? wvNewBatch.id : wvBatchChoice
          if (isNewBatch) {
            enqueue({
              table: 'wood_vinegar_batches',
              type: 'upsert',
              data: {
                id: wvNewBatch.id,
                batch_id: wvNewBatch.batch_id,
                location: wvNewBatch.location,
                status: 'open',
              },
              onConflict: 'id',
            })
          }
          enqueue({
            table: 'wood_vinegar_fills',
            type: 'upsert',
            data: {
              id: wvExistingFillId,
              batch_id: fillBatchId,
              production_id: existingId,
              operator_id: loggedInOperator?.id || null,
              fill_date: date,
              volume_liters: Number(wvVolume),
              notes: wvNotes || null,
              updated_at: new Date().toISOString(),
            },
            onConflict: 'id',
          })
          setWvFillPersisted(true)
          if (wvCloseBatch && !isNewBatch) {
            enqueue({
              table: 'wood_vinegar_batches',
              type: 'update',
              data: { status: 'in_stock', closed_date: todayISO(), updated_at: new Date().toISOString() },
              match: { id: wvBatchChoice },
            })
          }
        }
        // Offline save: don't claim lastSavedAt — that's reserved for confirmed
        // Supabase writes. The (online=false, queueCount>0) state drives the
        // "Saved locally — will sync" indicator. Nudge App's queueCount so the
        // dot appears without waiting for the 5s poll.
        if (!silent) setSavedMessage('Saved locally — will sync')
        setDirty(false)
        setIsPersisted(true)
        onQueueChange?.()
        setSaving(false)
        return
      }

      // With existingId pre-allocated by the load effect, daily_production
      // saves are unconditional upserts on the local UUID. First save inserts
      // the row; every subsequent save updates it.
      const productionId = existingId
      {
        const { error } = await supabase
          .from('daily_production')
          .upsert({ ...productionData, id: productionId }, { onConflict: 'id' })
        if (error) throw error
      }

      // Update feedstock link
      await supabase.from('daily_production_feedstock').delete().eq('production_id', productionId)
      if (selectedFeedstock) {
        await supabase.from('daily_production_feedstock').insert({
          production_id: productionId,
          feedstock_id: selectedFeedstock,
        })
      }

      // Save bags. addBag pre-allocates bag.id so every bag is upsertable on
      // its UUID — no branch on whether it exists in the DB yet.
      for (let i = 0; i < bags.length; i++) {
        const bag = bags[i]
        const bagData = {
          id: bag.id,
          bulk_bag_id: bag.bulk_bag_id,
          fill_date: date,
          shift,
          machine_id: machineId,
          production_id: productionId,
          operator_id: loggedInOperator?.id || null,
          wet_weight_kg: bag.wet_weight_kg === '' ? null : Number(bag.wet_weight_kg),
          moisture_pct: bag.moisture_pct === '' ? null : Number(bag.moisture_pct),
          volume_m3: bag.volume_m3 === '' ? null : Number(bag.volume_m3),
          subsample_taken: bag.subsample_taken || false,
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase
          .from('bulk_bags')
          .upsert(bagData, { onConflict: 'id' })
        if (error) throw error
        bag._saved = true
        setFlashIdx(i)
      }

      // Wood vinegar save (CP500 + collected toggled on). wvValid gates
      // silent autosave from attempting a save of in-progress WV state.
      // With pre-allocated UUIDs the online path is now a straight upsert
      // — no separate INSERT-then-read-id round-trip, no retry loop. If a
      // simultaneous-operator race causes a 23505 on either the WV### key
      // or the partial IBC#N unique index, it propagates as an error
      // (autoSaveFailCount handles the retry-vs-give-up behaviour at the
      // autosave-loop level).
      if (wvValid && isCP500 && wvCollected) {
        const isNewBatch = wvBatchChoice === NEW_WV_BATCH && wvNewBatch
        const batchUuid = isNewBatch ? wvNewBatch.id : wvBatchChoice

        if (isNewBatch) {
          const { error: batchErr } = await supabase
            .from('wood_vinegar_batches')
            .upsert(
              {
                id: wvNewBatch.id,
                batch_id: wvNewBatch.batch_id,
                location: wvNewBatch.location,
                status: 'open',
              },
              { onConflict: 'id' },
            )
          if (batchErr) throw batchErr
        }

        // wvExistingFillId is pre-allocated when wvCollected toggles on, so
        // we always have a stable id to upsert against. No more risk of
        // accidental duplicate fills on autosave.
        const fillPayload = {
          id: wvExistingFillId,
          batch_id: batchUuid,
          production_id: productionId,
          operator_id: loggedInOperator?.id || null,
          fill_date: date,
          volume_liters: Number(wvVolume),
          notes: wvNotes || null,
          updated_at: new Date().toISOString(),
        }

        const { error: fillErr } = await supabase
          .from('wood_vinegar_fills')
          .upsert(fillPayload, { onConflict: 'id' })
        if (fillErr) throw fillErr
        setWvFillPersisted(true)

        // Reflect the new-batch promotion locally: the sentinel choice
        // becomes the real UUID, and the staging wvNewBatch is cleared
        // because the row exists in the DB now.
        if (isNewBatch) {
          setWvBatchChoice(batchUuid)
          setWvNewBatch(null)
        }

        if (wvCloseBatch && !isNewBatch) {
          const { error } = await supabase
            .from('wood_vinegar_batches')
            .update({
              status: 'in_stock',
              closed_date: todayISO(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', batchUuid)
          if (error) throw error
          setWvCloseBatch(false)
        }

        // Refresh batch list (all statuses — allocation needs to see them)
        const { data: refreshed } = await supabase
          .from('v_wood_vinegar_batches')
          .select('*')
          .order('batch_id')
        if (refreshed) setWvBatches(refreshed)
      }

      // Refresh next bag number
      const { data: latestBag } = await supabase
        .from('bulk_bags')
        .select('bulk_bag_id')
        .order('bulk_bag_id', { ascending: false })
        .limit(1)
      if (latestBag?.[0]) {
        const num = parseInt(latestBag[0].bulk_bag_id.replace(/\D/g, ''), 10)
        if (!isNaN(num)) setNextBagNum(num + 1)
      }

      setBags([...bags])
      setDirty(false)
      setIsPersisted(true)
      setLastSavedAt(new Date())
      if (!silent) {
        setSavedMessage('Saved')
        if (navigator.vibrate) navigator.vibrate(50)
      }
      setFlashIdx(null)
    } catch (err) {
      if (silent) {
        throw err
      }
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Keep a stable ref to the latest handleSave so the auto-save effect can
  // call it without needing every form-state variable in its dep array.
  handleSaveRef.current = handleSave

  // Reset the auto-save indicator when the operator loads a different
  // day/shift/machine — the new record isn't "dirty" or "saved" yet.
  useEffect(() => {
    setLastSavedAt(null)
    setAutoSaveFailCount(0)
  }, [date, shift, machineId])

  // Debounced auto-save: 5s after the last edit, persist silently.
  // Keyed on dirtyTick so the timer truly resets per keystroke — using
  // `dirty` as the dep would only fire once per save cycle regardless of
  // how long the operator kept typing. Text fields also save on blur
  // (see handleTextBlur), so the 5s wait mainly covers structured fields
  // (numbers, toggles, dropdowns, bag adds). After 3 consecutive failures,
  // stop retrying — the operator must intervene with a manual save (the
  // indicator surfaces this state).
  useEffect(() => {
    if (!dirty || saving || autoSaveFailCount >= 3) return
    const timer = setTimeout(async () => {
      try {
        await handleSaveRef.current({ silent: true })
        setAutoSaveFailCount(0)
      } catch (err) {
        console.error('Auto-save failed', err)
        setAutoSaveFailCount((c) => c + 1)
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [dirty, dirtyTick, saving, autoSaveFailCount])

  // When App.jsx successfully drains the offline queue (queueCount transitions
  // from >0 to 0 while online), stamp lastSavedAt with the drain time so the
  // indicator flips from "Syncing…" to "Saved HH:MM". Also mark every visible
  // bag as _saved — the queue is empty so they've all landed in the DB, and
  // the UI's "saved bag" styling (green border, confirm-on-remove) should
  // reflect that. Re-fetch the WV batch list (all statuses — allocation
  // needs the full picture) so totals/fill counts reflect rows that just
  // synced. Finally, if a locally-allocated new batch is now persisted,
  // swap the sentinel choice to its real UUID and clear wvNewBatch so the
  // UI stops showing the "New batch: WV### — IBC#N" display.
  const prevQueueCountRef = useRef(queueCount)
  useEffect(() => {
    if (prevQueueCountRef.current > 0 && queueCount === 0 && online) {
      setLastSavedAt(new Date())
      setBags((prev) => prev.map((b) => (b._saved ? b : { ...b, _saved: true })))
      if (isCP500) {
        supabase
          .from('v_wood_vinegar_batches')
          .select('*')
          .order('batch_id')
          .then(({ data }) => {
            if (data) setWvBatches(data)
          })
      }
      if (wvNewBatch) {
        setWvBatchChoice(wvNewBatch.id)
        setWvNewBatch(null)
      }
    }
    prevQueueCountRef.current = queueCount
  }, [queueCount, online, isCP500, wvNewBatch])

  const feedstockInput =
    feedstockStartWeight !== '' && feedstockEndWeight !== ''
      ? Math.max(0, Number(feedstockStartWeight) - Number(feedstockEndWeight)).toFixed(2)
      : '-'

  const validationIssues = getValidationIssues()
  const hardBlocked = hasHardIssue(validationIssues)
  const hardFields = new Set(
    validationIssues.filter((i) => i.severity === 'hard').map((i) => i.field),
  )

  return (
    <div className="pb-28 px-4 pt-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold">Daily Production Sheet</h1>
        {(() => {
          const status = getSaveStatus({
            saving, online, dirty, queueCount, autoSaveFailCount, lastSavedAt,
          })
          if (!status) return null
          return (
            <span className="text-xs flex items-center gap-1.5 flex-shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.dot}`} />
              <span className={status.text}>{status.label}</span>
            </span>
          )
        })()}
      </div>

      {/* Header */}
      <div className="space-y-4">
        <div>
          <label className="field-label">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); markDirty() }}
            className="input-field"
          />
        </div>

        <ToggleGroup
          label="Shift"
          options={['Morning', 'Evening', 'Night']}
          value={shift}
          onChange={(v) => { setShift(v); markDirty() }}
        />

        <ToggleGroup
          label="Machine"
          options={[
            { value: 'CP500', label: 'CP500' },
            { value: 'CP1000', label: 'CP1000' },
          ]}
          value={machineKey}
          onChange={(v) => { setMachineKey(v); markDirty() }}
        />

        <div>
          <label className="field-label">Operator(s)</label>
          <input
            type="text"
            value={operatorName}
            onChange={(e) => { setOperatorName(e.target.value); markDirty() }}
            onBlur={handleTextBlur}
            placeholder="Name(s)"
            className="input-field"
          />
        </div>

        <div>
          <label className="field-label">Feed Source</label>
          <select
            value={selectedFeedstock}
            onChange={(e) => selectFeedstock(e.target.value)}
            className={`input-field ${selectedFeedstock === '' ? '!text-gray-400 !font-normal' : ''}`}
          >
            <option value="">Select feed source...</option>
            {feedstockSources.map((fs) => (
              <option key={fs.id} value={fs.id}>{fs.source_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Feedstock */}
      <h2 className="section-header">Feedstock</h2>
      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          label="Start Weight"
          value={feedstockStartWeight}
          onChange={(v) => { setFeedstockStartWeight(v); markDirty() }}
          unit="t"
          step={0.1}
          min={0}
          error={hardFields.has('feedstock_start_weight_t')}
        />
        <NumberInput
          label="End Weight"
          value={feedstockEndWeight}
          onChange={(v) => { setFeedstockEndWeight(v); markDirty() }}
          unit="t"
          step={0.1}
          min={0}
          error={hardFields.has('feedstock_end_weight_t')}
        />
        <NumberInput
          label="Moisture"
          value={feedstockMoisture}
          onChange={(v) => { setFeedstockMoisture(v); markDirty() }}
          unit="%"
          step={1}
          min={0}
          max={100}
          error={hardFields.has('feedstock_moisture_pct')}
        />
        <div>
          <label className="field-label">Input (calculated)</label>
          <div className="input-field text-center bg-gray-50 text-gray-500">{feedstockInput} t</div>
        </div>
      </div>

      {/* Operating Window — runtime + downtime live here together (visible by
          default). Runtime was previously buried inside the Machine Readings
          collapsible; promoted out so downtime (which pairs conceptually with
          runtime) isn't hidden either. */}
      <h2 className="section-header">Operating Window</h2>
      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          label="Runtime"
          value={runtimeHours}
          onChange={(v) => { setRuntimeHours(v); markDirty() }}
          unit="hrs"
          step={1}
          min={0}
        />
        <NumberInput
          label="Downtime"
          value={downtimeHours}
          onChange={(v) => { setDowntimeHours(v); markDirty() }}
          unit="hrs"
          step={0.5}
          min={0}
        />
      </div>
      <div className="mt-4">
        <label className="field-label">Downtime reason</label>
        <select
          value={downtimeReason}
          onChange={(e) => { setDowntimeReason(e.target.value); markDirty() }}
          className={`input-field ${downtimeReason === '' ? '!text-gray-400 !font-normal' : ''}`}
        >
          <option value="">Select reason...</option>
          {DOWNTIME_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {downtimeHours !== '' && Number(downtimeHours) > 0 && downtimeReason === '' && (
          <p className="text-sm text-gray-500 mt-1">Pick a reason for the downtime.</p>
        )}
      </div>

      {/* Machine Readings (collapsible) */}
      <button
        type="button"
        onClick={() => setReadingsOpen((o) => !o)}
        className="section-header flex items-center justify-between w-full text-left"
      >
        <span>Machine Readings</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className={`w-5 h-5 text-gray-400 transition-transform ${readingsOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {readingsOpen && (
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Diesel"
            value={dieselLitres}
            onChange={(v) => { setDieselLitres(v); markDirty() }}
            unit="L"
            step={1}
            min={0}
          />
          <NumberInput
            label="Avg Pyro Temp"
            value={avgPyroTemp}
            onChange={(v) => { setAvgPyroTemp(v); markDirty() }}
            unit="C"
            step={5}
            min={0}
          />
          <NumberInput
            label="Max Pyro Temp"
            value={maxPyroTemp}
            onChange={(v) => { setMaxPyroTemp(v); markDirty() }}
            unit="C"
            step={5}
            min={0}
          />
          <NumberInput
            label="Avg Exhaust Temp"
            value={avgExhaustTemp}
            onChange={(v) => { setAvgExhaustTemp(v); markDirty() }}
            unit="C"
            step={5}
            min={0}
          />
          <NumberInput
            label="Thermal Output"
            value={thermalOutput}
            onChange={(v) => { setThermalOutput(v); markDirty() }}
            unit="kWh"
            step={10}
            min={0}
          />
        </div>
      )}

      {/* Maintenance Log */}
      <h2 className="section-header">Maintenance Log</h2>
      <textarea
        value={maintenanceNotes}
        onChange={(e) => { setMaintenanceNotes(e.target.value); markDirty() }}
        onBlur={handleTextBlur}
        rows={3}
        placeholder="e.g. feed auger jammed at 10am; thermocouple erratic on CP1000"
        className="input-field text-base"
      />

      {/* Notes */}
      <h2 className="section-header">Notes</h2>
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); markDirty() }}
        onBlur={handleTextBlur}
        rows={3}
        placeholder="Any comments..."
        className="input-field text-base"
      />

      {/* Bulk Bags */}
      <h2 className="section-header">Bulk Bags ({bags.length})</h2>
      <div className="space-y-4">
        {bags.map((bag, i) => {
          const dryWeight =
            bag.wet_weight_kg !== '' &&
            bag.wet_weight_kg != null &&
            bag.moisture_pct !== '' &&
            bag.moisture_pct != null
              ? (Number(bag.wet_weight_kg) * (1 - Number(bag.moisture_pct) / 100)).toFixed(1)
              : '-'
          const density =
            dryWeight !== '-' && bag.volume_m3 && Number(bag.volume_m3) > 0
              ? (Number(dryWeight) / Number(bag.volume_m3)).toFixed(1)
              : '-'

          return (
            <div
              key={bag.id || `new-${i}`}
              className={`border-2 rounded-2xl p-4 space-y-3 transition-colors ${
                flashIdx === i
                  ? 'save-flash border-green-400'
                  : bag._saved
                  ? 'border-green-300 bg-green-50/30'
                  : 'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold">{bag.bulk_bag_id || `Bag ${i + 1}`}</span>
                <button
                  type="button"
                  onClick={() => removeBag(i)}
                  className="text-red-400 text-sm font-semibold py-1 px-2"
                >
                  Remove
                </button>
              </div>

              <div>
                <label className="field-label">Bag ID</label>
                <input
                  type="text"
                  value={bag.bulk_bag_id}
                  onChange={(e) => updateBag(i, 'bulk_bag_id', e.target.value)}
                  onBlur={handleTextBlur}
                  placeholder="GRIP0177"
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Wet Weight"
                  value={bag.wet_weight_kg}
                  onChange={(v) => updateBag(i, 'wet_weight_kg', v)}
                  unit="kg"
                  step={1}
                  min={0}
                  error={hardFields.has(`bag_${i}_wet`)}
                />
                <NumberInput
                  label="Moisture"
                  value={bag.moisture_pct}
                  onChange={(v) => updateBag(i, 'moisture_pct', v)}
                  unit="%"
                  step={1}
                  min={0}
                  max={100}
                  error={hardFields.has(`bag_${i}_moisture`)}
                />
                <NumberInput
                  label="Volume"
                  value={bag.volume_m3}
                  onChange={(v) => updateBag(i, 'volume_m3', v)}
                  unit="m3"
                  step={1}
                  min={0}
                  error={hardFields.has(`bag_${i}_vol`)}
                />
                <div>
                  <label className="field-label">Dry Weight</label>
                  <div className={`input-field text-center bg-gray-50 ${dryWeight !== '-' ? 'text-gray-900 text-2xl font-bold' : 'text-gray-400'}`}>
                    {dryWeight} kg
                  </div>
                </div>
              </div>

              {density !== '-' && (
                <div className="text-sm text-gray-500">
                  Density: <span className="font-semibold text-gray-700">{density} kg/m3</span>
                </div>
              )}

              <Toggle
                label="Sub-sample taken"
                value={bag.subsample_taken || false}
                onToggle={() => { updateBag(i, 'subsample_taken', !bag.subsample_taken) }}
              />
            </div>
          )
        })}

        <button
          type="button"
          onClick={addBag}
          disabled={addingBag}
          className="w-full py-4 border-2 border-dashed border-gray-400 rounded-2xl text-lg font-bold text-gray-500 active:bg-gray-100 disabled:opacity-50"
        >
          {addingBag ? 'Adding...' : '+ Add Bag'}
        </button>
      </div>

      {/* Wood Vinegar (CP500 only) */}
      {isCP500 && (
        <WoodVinegarSection
          online={online}
          collected={wvCollected}
          persistedFill={
            wvFillPersisted && wvExistingFillId
              ? {
                  batchLabel: (() => {
                    const b = wvBatches.find((x) => x.id === wvBatchChoice)
                    if (!b) return wvBatchChoice === '' ? 'Batch unknown' : '—'
                    return b.location ? `${b.batch_id} — ${b.location}` : b.batch_id
                  })(),
                  volumeLiters: wvVolume,
                }
              : null
          }
          onRemoveFill={removeWvFill}
          onCollectedChange={(v) => {
            // Toggle OFF when a fill is persisted = explicit delete intent.
            // removeWvFill handles state reset + DB delete + queue ops. It's
            // immediate (not deferred to next save) so navigating away can't
            // leave a phantom fill behind.
            if (!v && wvCollected && wvFillPersisted) {
              removeWvFill()
              return
            }
            setWvCollected(v)
            if (!v) setWvErrors({})
            markDirty()
          }}
          openBatches={wvBatches.filter((b) => b.status === 'open')}
          batchChoice={wvBatchChoice}
          onBatchChoiceChange={(v) => {
            setWvBatchChoice(v)
            if (v === NEW_WV_BATCH) {
              // Allocate canonical WV### + IBC#N synchronously from the
              // in-memory list so the read-only display shows the values
              // immediately on this same render — no async "Allocating…"
              // flash. Pre-allocated UUID makes the batch upsertable on
              // both offline and online save paths.
              setWvNewBatch({
                id: crypto.randomUUID(),
                batch_id: allocateNextBatchId(wvBatches),
                location: allocateNextIbcLocation(wvBatches),
              })
            } else {
              setWvNewBatch(null)
            }
            if (v === NEW_WV_BATCH || v === '') setWvCloseBatch(false)
            setWvErrors((e) => ({ ...e, batch: undefined }))
            markDirty()
          }}
          newBatch={wvNewBatch}
          volume={wvVolume}
          onVolumeChange={(v) => {
            setWvVolume(v)
            setWvErrors((e) => ({ ...e, volume: undefined }))
            markDirty()
          }}
          notes={wvNotes}
          onNotesChange={(v) => { setWvNotes(v); markDirty() }}
          onTextBlur={handleTextBlur}
          closeBatch={wvCloseBatch}
          onCloseBatchChange={(v) => { setWvCloseBatch(v); markDirty() }}
          errors={wvErrors}
        />
      )}

      {/* Validation issues — hard issues (red) block the save; warnings
          (amber) are informational and don't block, mirroring the dashboard. */}
      {validationIssues.length > 0 && (
        <div className="mt-6 space-y-1">
          {validationIssues.map((issue, idx) => (
            <p
              key={idx}
              className={`text-sm font-medium ${issue.severity === 'hard' ? 'text-red-600' : 'text-amber-600'}`}
            >
              {issue.severity === 'hard' ? '⛔ ' : '⚠️ '}{issue.message}
            </p>
          ))}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || hardBlocked}
        className="btn-primary w-full mt-8 disabled:opacity-50"
      >
        {saving ? 'Saving...' : existingId ? 'Update Run Sheet' : 'Save Run Sheet'}
      </button>

      <SaveConfirmation
        show={!!savedMessage}
        message={savedMessage || 'Saved'}
        onDone={() => setSavedMessage(null)}
      />
    </div>
  )
}
