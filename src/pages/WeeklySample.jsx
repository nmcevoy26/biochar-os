import { useState, useEffect } from 'react'
import { supabase, MACHINES } from '../lib/supabase'
import ToggleGroup from '../components/ToggleGroup'
import SaveConfirmation from '../components/SaveConfirmation'

function getMondayOfWeek(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getISOWeek(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

export default function WeeklySample({ online }) {
  const [machineKey, setMachineKey] = useState(
    () => localStorage.getItem('grip_last_machine') || 'CP500'
  )
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek())
  const [subsamplesCollected, setSubsamplesCollected] = useState(false)
  const [compositeCreated, setCompositeCreated] = useState(false)
  const [storageLabel, setStorageLabel] = useState('')
  const [storedDate, setStoredDate] = useState(() => new Date().toISOString().slice(0, 10))
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
        const today = new Date().toISOString().slice(0, 10)
        if (data) {
          setExistingId(data.id)
          setSubsamplesCollected(data.daily_subsamples_collected || false)
          setCompositeCreated(data.composite_created || false)
          setStorageLabel(data.storage_label || '')
          setStoredDate(data.stored_date || today)
          setSentToLab(data.sent_to_lab || false)
          setSentDate(data.sent_date || today)
          setNotes(data.notes || '')
        } else {
          setExistingId(null)
          setSubsamplesCollected(false)
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
        storage_label: storageLabel || null,
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

  const Toggle = ({ label, value, onToggle }) => (
    <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-xl px-4 py-3.5">
      <span className="text-lg font-semibold">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`w-14 h-8 rounded-full transition-colors flex items-center ${
          value ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )

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
          <Toggle
            label="Daily sub-samples collected"
            value={subsamplesCollected}
            onToggle={() => { setSubsamplesCollected(!subsamplesCollected); markDirty() }}
          />
          <Toggle
            label="Composite sample created"
            value={compositeCreated}
            onToggle={() => { setCompositeCreated(!compositeCreated); markDirty() }}
          />
        </div>

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
