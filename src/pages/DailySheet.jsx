import { useState, useEffect } from 'react'
import { supabase, MACHINES, detectShift, todayISO } from '../lib/supabase'
import { enqueue } from '../lib/offline'
import ToggleGroup from '../components/ToggleGroup'
import NumberInput from '../components/NumberInput'
import SaveConfirmation from '../components/SaveConfirmation'

const EMPTY_BAG = {
  bulk_bag_id: '',
  wet_weight_kg: '',
  moisture_pct: '',
  volume_m3: 1,
}

export default function DailySheet({ online, operator: loggedInOperator }) {
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
  const [dieselLitres, setDieselLitres] = useState('')
  const [avgPyroTemp, setAvgPyroTemp] = useState('')
  const [maxPyroTemp, setMaxPyroTemp] = useState('')
  const [avgExhaustTemp, setAvgExhaustTemp] = useState('')
  const [thermalOutput, setThermalOutput] = useState('')
  const [notes, setNotes] = useState('')
  const [bags, setBags] = useState([])
  const [nextBagNum, setNextBagNum] = useState(177)
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [flashIdx, setFlashIdx] = useState(null)
  const [readingsOpen, setReadingsOpen] = useState(false)

  const machineId = MACHINES[machineKey]

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
          setOperatorName(data.operator || loggedInOperator?.name || '')
          setFeedstockStartWeight(data.feedstock_start_weight_t ?? '')
          setFeedstockEndWeight(data.feedstock_end_weight_t ?? '')
          setFeedstockMoisture(data.feedstock_moisture_pct ?? '')
          setRuntimeHours(data.runtime_hours ?? '')
          setDieselLitres(data.diesel_litres ?? '')
          setAvgPyroTemp(data.avg_pyrolysis_temp_c ?? '')
          setMaxPyroTemp(data.max_pyrolysis_temp_c ?? '')
          setAvgExhaustTemp(data.avg_exhaust_temp_c ?? '')
          setThermalOutput(data.thermal_output_kwh ?? '')
          setNotes(data.notes || '')
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
        } else {
          setExistingId(null)
          setOperatorName(loggedInOperator?.name || '')
          setFeedstockStartWeight('')
          setFeedstockEndWeight('')
          setFeedstockMoisture('')
          setRuntimeHours('')
          setDieselLitres('')
          setAvgPyroTemp('')
          setMaxPyroTemp('')
          setAvgExhaustTemp('')
          setThermalOutput('')
          setNotes('')
          setSelectedFeedstock('')
          setBags([])
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
  }

  function selectFeedstock(id) {
    setSelectedFeedstock(id)
    markDirty()
  }

  function addBag() {
    const unsavedCount = bags.filter((b) => !b._saved).length
    const bagId = 'GRIP' + String(nextBagNum + unsavedCount).padStart(4, '0')
    setBags((prev) => [...prev, { ...EMPTY_BAG, bulk_bag_id: bagId }])
    markDirty()
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
    if (bags[index]._saved && !confirm('Remove this saved bag?')) return
    setBags((prev) => prev.filter((_, i) => i !== index))
    markDirty()
  }

  async function handleSave() {
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
        diesel_litres: dieselLitres === '' ? null : Number(dieselLitres),
        avg_pyrolysis_temp_c: avgPyroTemp === '' ? null : Number(avgPyroTemp),
        max_pyrolysis_temp_c: maxPyroTemp === '' ? null : Number(maxPyroTemp),
        avg_exhaust_temp_c: avgExhaustTemp === '' ? null : Number(avgExhaustTemp),
        thermal_output_kwh: thermalOutput === '' ? null : Number(thermalOutput),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }

      if (!online) {
        enqueue({
          table: 'daily_production',
          type: existingId ? 'update' : 'insert',
          data: existingId ? productionData : { ...productionData, id: crypto.randomUUID() },
          match: existingId ? { id: existingId } : undefined,
        })
        for (const bag of bags) {
          if (!bag._saved) {
            enqueue({
              table: 'bulk_bags',
              type: 'insert',
              data: {
                bulk_bag_id: bag.bulk_bag_id,
                fill_date: date,
                shift,
                machine_id: machineId,
                operator_id: loggedInOperator?.id || null,
                wet_weight_kg: bag.wet_weight_kg === '' ? null : Number(bag.wet_weight_kg),
                moisture_pct: bag.moisture_pct === '' ? null : Number(bag.moisture_pct),
                volume_m3: bag.volume_m3 === '' ? null : Number(bag.volume_m3),
              },
            })
          }
        }
        setShowSaved(true)
        setDirty(false)
        setSaving(false)
        return
      }

      let productionId = existingId

      if (existingId) {
        const { error } = await supabase
          .from('daily_production')
          .update(productionData)
          .eq('id', existingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('daily_production')
          .insert(productionData)
          .select('id')
          .single()
        if (error) throw error
        productionId = data.id
        setExistingId(data.id)
      }

      // Update feedstock link
      await supabase.from('daily_production_feedstock').delete().eq('production_id', productionId)
      if (selectedFeedstock) {
        await supabase.from('daily_production_feedstock').insert({
          production_id: productionId,
          feedstock_id: selectedFeedstock,
        })
      }

      // Save bags
      for (let i = 0; i < bags.length; i++) {
        const bag = bags[i]
        const bagData = {
          bulk_bag_id: bag.bulk_bag_id,
          fill_date: date,
          shift,
          machine_id: machineId,
          production_id: productionId,
          operator_id: loggedInOperator?.id || null,
          wet_weight_kg: bag.wet_weight_kg === '' ? null : Number(bag.wet_weight_kg),
          moisture_pct: bag.moisture_pct === '' ? null : Number(bag.moisture_pct),
          volume_m3: bag.volume_m3 === '' ? null : Number(bag.volume_m3),
          updated_at: new Date().toISOString(),
        }
        if (bag.id) {
          await supabase.from('bulk_bags').update(bagData).eq('id', bag.id)
        } else {
          const { data } = await supabase.from('bulk_bags').insert(bagData).select('id').single()
          if (data) bag.id = data.id
        }
        bag._saved = true
        setFlashIdx(i)
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
      setShowSaved(true)
      setFlashIdx(null)
      if (navigator.vibrate) navigator.vibrate(50)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const feedstockInput =
    feedstockStartWeight !== '' && feedstockEndWeight !== ''
      ? Math.max(0, Number(feedstockStartWeight) - Number(feedstockEndWeight)).toFixed(2)
      : '-'

  return (
    <div className="pb-28 px-4 pt-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Daily Production Sheet</h1>
        {dirty && <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" title="Unsaved changes" />}
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
        />
        <NumberInput
          label="End Weight"
          value={feedstockEndWeight}
          onChange={(v) => { setFeedstockEndWeight(v); markDirty() }}
          unit="t"
          step={0.1}
          min={0}
        />
        <NumberInput
          label="Moisture"
          value={feedstockMoisture}
          onChange={(v) => { setFeedstockMoisture(v); markDirty() }}
          unit="%"
          step={1}
          min={0}
          max={100}
        />
        <div>
          <label className="field-label">Input (calculated)</label>
          <div className="input-field text-center bg-gray-50 text-gray-500">{feedstockInput} t</div>
        </div>
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
            label="Runtime"
            value={runtimeHours}
            onChange={(v) => { setRuntimeHours(v); markDirty() }}
            unit="hrs"
            step={1}
            min={0}
          />
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

      {/* Notes */}
      <h2 className="section-header">Notes</h2>
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); markDirty() }}
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
                />
                <NumberInput
                  label="Moisture"
                  value={bag.moisture_pct}
                  onChange={(v) => updateBag(i, 'moisture_pct', v)}
                  unit="%"
                  step={1}
                  min={0}
                  max={100}
                />
                <NumberInput
                  label="Volume"
                  value={bag.volume_m3}
                  onChange={(v) => updateBag(i, 'volume_m3', v)}
                  unit="m3"
                  step={1}
                  min={0}
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
            </div>
          )
        })}

        <button
          type="button"
          onClick={addBag}
          className="w-full py-4 border-2 border-dashed border-gray-400 rounded-2xl text-lg font-bold text-gray-500 active:bg-gray-100"
        >
          + Add Bag
        </button>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full mt-8 disabled:opacity-50"
      >
        {saving ? 'Saving...' : existingId ? 'Update Run Sheet' : 'Save Run Sheet'}
      </button>

      <SaveConfirmation show={showSaved} onDone={() => setShowSaved(false)} />
    </div>
  )
}
