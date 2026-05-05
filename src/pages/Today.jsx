import { useState, useEffect } from 'react'
import { supabase, todayISO, MACHINE_NAMES } from '../lib/supabase'
import SwipeCard from '../components/SwipeCard'

export default function Today() {
  const [runs, setRuns] = useState([])
  const [samples, setSamples] = useState([])
  const [subsampleCounts, setSubsampleCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadToday()
    loadWeeklySamples()

    const channel = supabase
      .channel('today-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_production' },
        () => loadToday()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bulk_bags' },
        () => loadToday()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_samples' },
        () => loadWeeklySamples()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadToday() {
    const today = todayISO()
    const { data } = await supabase
      .from('v_daily_production')
      .select('*')
      .eq('date', today)
      .order('shift')

    if (data) setRuns(data)
    setLoading(false)
  }

  async function loadWeeklySamples() {
    const today = todayISO()
    const { data } = await supabase
      .from('weekly_samples')
      .select('*')
      .lte('week_start_date', today)
      .gte('week_end_date', today)

    if (data) {
      setSamples(data)
      // Load subsample counts for each sample's week/machine
      const counts = {}
      for (const sample of data) {
        const { count } = await supabase
          .from('bulk_bags')
          .select('*', { count: 'exact', head: true })
          .eq('machine_id', sample.machine_id)
          .eq('subsample_taken', true)
          .gte('fill_date', sample.week_start_date)
          .lte('fill_date', sample.week_end_date)
        counts[sample.id] = count || 0
      }
      setSubsampleCounts(counts)
    }
  }

  async function deleteRun(runId) {
    await supabase.from('bulk_bags').delete().eq('production_id', runId)
    await supabase.from('daily_production_feedstock').delete().eq('production_id', runId)
    await supabase.from('daily_production').delete().eq('id', runId)
    loadToday()
  }

  async function deleteSample(sampleId) {
    await supabase.from('weekly_samples').delete().eq('id', sampleId)
    loadWeeklySamples()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-28 px-4 pt-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Today's Production</h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date().toLocaleDateString('en-AU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      {runs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-16 h-16 mx-auto mb-4"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <p className="text-lg font-semibold">No runs logged today</p>
          <p className="text-sm mt-1">Switch to Daily Sheet to start a new run</p>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => (
            <SwipeCard key={run.id} onDelete={() => deleteRun(run.id)}>
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold">{run.machine_name}</span>
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-semibold">
                      {run.shift}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{run.operator || '-'}</span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <span className="field-label">Bags</span>
                    <span className="field-value block">{run.bag_count || 0}</span>
                  </div>
                  <div>
                    <span className="field-label">Biochar</span>
                    <span className="field-value block">
                      {run.biochar_produced_t != null
                        ? `${Number(run.biochar_produced_t).toFixed(2)}t`
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="field-label">Yield</span>
                    <span className="field-value block">
                      {run.yield_pct != null ? `${Number(run.yield_pct).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="text-gray-400">Feedstock</span>
                    <span className="block font-semibold">
                      {run.feedstock_input_t != null
                        ? `${Number(run.feedstock_input_t).toFixed(2)}t`
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Runtime</span>
                    <span className="block font-semibold">
                      {run.runtime_hours != null ? `${run.runtime_hours}h` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Diesel</span>
                    <span className="block font-semibold">
                      {run.diesel_litres != null ? `${Number(run.diesel_litres).toFixed(0)}L` : '-'}
                    </span>
                  </div>
                </div>

                {run.notes && (
                  <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-2">{run.notes}</p>
                )}
              </div>
            </SwipeCard>
          ))}

          {/* Day total */}
          <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-5">
            <h2 className="font-bold text-lg mb-3">Day Total</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="field-label">Runs</span>
                <span className="field-value block">{runs.length}</span>
              </div>
              <div>
                <span className="field-label">Bags</span>
                <span className="field-value block">
                  {runs.reduce((s, r) => s + (r.bag_count || 0), 0)}
                </span>
              </div>
              <div>
                <span className="field-label">Biochar</span>
                <span className="field-value block">
                  {runs.reduce((s, r) => s + (Number(r.biochar_produced_t) || 0), 0).toFixed(2)}t
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {samples.length > 0 && (
        <>
          <h2 className="text-xl font-bold mt-8 mb-4">Weekly Samples</h2>
          <div className="space-y-4">
            {samples.map((sample) => (
              <SwipeCard key={sample.id} onDelete={() => deleteSample(sample.id)}>
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl font-bold">
                      {MACHINE_NAMES[sample.machine_id] || 'Unknown'}
                    </span>
                    <span className="text-sm font-mono text-gray-500">
                      {sample.storage_label || '-'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-gray-400">Sub-samples</span>
                      <span className={`mt-1 text-sm font-bold px-3 py-0.5 rounded-lg self-start ${
                        (subsampleCounts[sample.id] || 0) >= 5
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {subsampleCounts[sample.id] || 0}/5
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-400">Composite</span>
                      <span className={`mt-1 text-sm font-bold px-3 py-0.5 rounded-lg self-start ${
                        sample.composite_created
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sample.composite_created ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-400">Sent to lab</span>
                      <span className={`mt-1 text-sm font-bold px-3 py-0.5 rounded-lg self-start ${
                        sample.sent_to_lab
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sample.sent_to_lab ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>

                  {sample.stored_date && (
                    <p className="mt-3 text-sm text-gray-500">
                      Stored: <span className="font-semibold text-gray-700">{sample.stored_date}</span>
                    </p>
                  )}
                </div>
              </SwipeCard>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
