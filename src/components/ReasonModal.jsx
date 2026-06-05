import { useState } from 'react'

// Shown when an operator edits a PAST run's consequence fields (moisture /
// feedstock). A reason is required before the correction saves — it rides the
// daily_production upsert as last_edit_reason and the DB trigger writes it to
// audit_log.reason. iPad-sized touch targets to match the rest of the sheet.
export default function ReasonModal({ open, onCancel, onSubmit }) {
  const [reason, setReason] = useState('')
  if (!open) return null

  const canSave = reason.trim() !== ''

  function cancel() {
    setReason('')
    onCancel()
  }
  function submit() {
    if (!canSave) return
    onSubmit(reason.trim())
    setReason('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-xl font-bold">Reason for this correction</h3>
        <p className="mt-1 text-sm text-gray-500">
          You're changing feedstock or moisture on a past run. A short reason is
          recorded with the change.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder='e.g. "Corrected moisture — sensor read wrong at start-up"'
          className="input-field text-base mt-3"
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={cancel}
            className="flex-1 py-3.5 rounded-xl border-2 border-gray-300 text-lg font-bold text-gray-600 active:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            Save correction
          </button>
        </div>
      </div>
    </div>
  )
}
