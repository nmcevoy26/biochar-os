import { useState, useEffect } from 'react'
import { supabase, MACHINES, todayISO } from '../lib/supabase'
import { getMondayOfWeek, addDays, getISOWeek } from '../lib/dates'
import ToggleGroup from '../components/ToggleGroup'
import Toggle from '../components/Toggle'
import SaveConfirmation from '../components/SaveConfirmation'

export default function WeeklySample({ online }) {
  const [machineKey, setMachineKey] = useState(
    () => localStorage.getItem('grip_last_machine') || 'CP500'
  )
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek())
  const [compositeCreated, setCompositeCreated] = useState(false)
  const [subsampleBags, setSubsampleBags] = useState([])
  const [storageLabel, setStorageLabel] = useState('')
  const [storedDate, setStoredDate] = useState(todayISO)
  const [sentToLab, setSentToLab] = useState(false)
  const [sentDate, setSentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [existingId, setExistingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const machineId = MACHINES[machineKey]
  const weekEnd = addDays(weekStart, 6)
  const year = new Date(weekStart).getFullYear()
  const week = getISOWeek(weekStart)
  const compositeId = `WS-${machineKey}-${year}-W${String(week).padStart(2, '0')}`

  const subsamplesCollected = subsampleBags.length > 0

  // Load existing record
  useEffect(() => {
    if (!weekStart || !machineId) return
    supabase
      .from('weekly_samples')
      .select('*')
      .eq('week_start_date', weekStart)
      .eq('machine_id', machineId)
      .maybeSingle()
      .then(({ data }) => {
        const today = todayISO()
        if (data) {
          setExistingId(data.id)
          setCompositeCreated(data.composite_created || false)
          setStorageLabel(data.storage_label || '')
          setStoredDate(data.stored_date || today)
          setSentToLab(data.sent_to_lab || false)
          setSentDate(data.sent_date || today)
          setNotes(data.notes || '')
        } else {
          setExistingId(null)
          setCompositeCreated(false)
          setStorageLabel('')
          setStoredDate(today)
          setSentToLab(false)
          setSentDate(today)
          setNotes('')
        }
        setDirty(false)
      })
  }, [weekStart, machineId])

  // Load bags with sub-samples taken during this week
  useEffect(() => {
    if (!weekStart || !machineId) return
    supabase
      .from('bulk_bags')
      .select('bulk_bag_id, fill_date, wet_weight_kg, moisture_pct')
      .eq('machine_id', machineId)
      .eq('subsample_taken', true)
      .gte('fill_date', weekStart)
      .lte('fill_date', weekEnd)
      .order('fill_date')
      .then(({ data }) => {
        if (data) setSubsampleBags(data)
        else setSubsampleBags([])
      })
  }, [weekStart, weekEnd, machineId])

  function markDirty() {
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const sampleData = {
        machine_id: machineId,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        daily_subsamples_collected: subsamplesCollected,
        composite_created: compositeCreated,
        storage_label: storageLabel || compositeId,
        stored_date: storedDate || null,
        sent_to_lab: sentToLab,
        sent_date: sentToLab ? (sentDate || null) : null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }

      if (existingId) {
        const { error } = await supabase
          .from('weekly_samples')
          .update(sampleData)
          .eq('id', existingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('weekly_samples')
          .insert(sampleData)
          .select('id')
          .single()
        if (error) throw error
        setExistingId(data.id)
      }

      setDirty(false)
      setShowSaved(true)
      if (navigator.vibrate) navigator.vibrate(50)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-28 px-4 pt-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Weekly Sample Sheet</h1>
        {dirty && <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />}
      </div>

      <div className="space-y-4">
        <ToggleGroup
          label="Machine"
          options={[
            { value: 'CP500', label: 'CP500' },
            { value: 'CP1000', label: 'CP1000' },
          ]}
          value={machineKey}
          onChange={(v) => { setMachineKey(v); markDirty() }}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Week Start (Monday)</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => { setWeekStart(e.target.value); markDirty() }}
              className="input-field"
            />
          </div>
          <div>
            <label className="field-label">Week End (Sunday)</label>
            <input
              type="date"
              value={weekEnd}
              readOnly
              className="input-field bg-gray-50 text-gray-500"
            />
          </div>
        </div>

        <div>
          <label className="field-label">Composite Sample ID</label>
          <div className="input-field bg-gray-50 text-gray-500 font-mono">{compositeId}</div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-xl px-4 py-3.5">
            <span className="text-lg font-semibold">Daily sub-samples collected</span>
            <span className={`text-sm font-bold px-3 py-0.5 rounded-lg ${
              subsampleBags.length >= 5 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {subsampleBags.length}/5
            </span>
          </div>
          <Toggle
            label="Composite sample created"
            value={compositeCreated}
            onToggle={() => { setCompositeCreated(!compositeCreated); markDirty() }}
            disabled={subsampleBags.length < 5}
            hint={subsampleBags.length < 5 ? 'Requires 5 sub-samples' : undefined}
          />
        </div>

        {subsampleBags.length > 0 && (
          <div>
            <label className="field-label">Sub-samples this week</label>
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              {subsampleBags.map((bag, i) => {
                const dryWeight =
                  bag.wet_weight_kg != null && bag.moisture_pct != null
                    ? (Number(bag.wet_weight_kg) * (1 - Number(bag.moisture_pct) / 100)).toFixed(1)
                    : '-'
                return (
                  <div
                    key={bag.bulk_bag_id + i}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      i > 0 ? 'border-t border-gray-100' : ''
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">{bag.bulk_bag_id}</span>
                    <span className="text-sm text-gray-500">{bag.fill_date}</span>
                    <span className="text-sm font-semibold text-gray-700 ml-3">
                      {dryWeight !== '-' ? `${dryWeight} kg` : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label className="field-label">Storage Label</label>
          <input
            type="text"
            value={storageLabel}
            onChange={(e) => { setStorageLabel(e.target.value); markDirty() }}
            placeholder={compositeId}
            className="input-field"
          />
        </div>

        <div>
          <label className="field-label">Stored Date</label>
          <input
            type="date"
            value={storedDate}
            onChange={(e) => { setStoredDate(e.target.value); markDirty() }}
            className="input-field"
          />
        </div>

        <Toggle
          label="Sent to lab"
          value={sentToLab}
          onToggle={() => { setSentToLab(!sentToLab); markDirty() }}
          disabled={!compositeCreated}
          hint={!compositeCreated ? 'Create composite first' : undefined}
        />

        {sentToLab && (
          <div>
            <label className="field-label">Sent Date</label>
            <input
              type="date"
              value={sentDate}
              onChange={(e) => { setSentDate(e.target.value); markDirty() }}
              className="input-field"
            />
          </div>
        )}

        <div>
          <label className="field-label">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); markDirty() }}
            rows={3}
            placeholder="Any comments..."
            className="input-field text-base"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full mt-8 disabled:opacity-50"
      >
        {saving ? 'Saving...' : existingId ? 'Update Sample' : 'Save Sample'}
      </button>

      <SaveConfirmation show={showSaved} onDone={() => setShowSaved(false)} />
    </div>
  )
}
