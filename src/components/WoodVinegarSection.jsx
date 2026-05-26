import Toggle from './Toggle'
import NumberInput from './NumberInput'

const NEW_BATCH = '__new__'

function formatBatchOption(b) {
  const total = Number(b.total_volume_liters || 0)
  const totalLabel = `${total.toFixed(0)}L`
  const fills = `${b.fill_count} fill${b.fill_count === 1 ? '' : 's'}`
  return b.location
    ? `${b.batch_id} — ${b.location} — ${totalLabel} (${fills})`
    : `${b.batch_id} — ${totalLabel} (${fills})`
}

export default function WoodVinegarSection({
  online,
  collected,
  onCollectedChange,
  openBatches,
  batchChoice,
  onBatchChoiceChange,
  newBatch,
  volume,
  onVolumeChange,
  notes,
  onNotesChange,
  onTextBlur,
  closeBatch,
  onCloseBatchChange,
  errors,
  persistedFill,
  onRemoveFill,
}) {
  const isNew = batchChoice === NEW_BATCH
  const newDisabledOffline = !online

  return (
    <>
      <h2 className="section-header">Wood Vinegar</h2>

      <Toggle
        label="Wood vinegar collected this run?"
        value={collected}
        onToggle={() => onCollectedChange(!collected)}
      />

      {collected && (
        <div className="space-y-4 mt-4">
          {persistedFill && (
            <div>
              <label className="field-label">Saved fill</label>
              <div className="flex items-center justify-between border-2 border-green-300 bg-green-50/30 rounded-2xl p-3">
                <span className="font-medium">
                  {persistedFill.batchLabel} — {persistedFill.volumeLiters}L
                </span>
                <button
                  type="button"
                  onClick={onRemoveFill}
                  className="text-red-400 text-sm font-semibold py-1 px-2"
                >
                  ✕ Remove
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="field-label">Batch</label>
            <select
              value={batchChoice}
              onChange={(e) => onBatchChoiceChange(e.target.value)}
              className={`input-field ${batchChoice === '' ? '!text-gray-400 !font-normal' : ''} ${
                errors?.batch ? 'border-red-400' : ''
              }`}
            >
              <option value="">Select batch...</option>
              <option value={NEW_BATCH} disabled={newDisabledOffline}>
                + Start new batch{newDisabledOffline ? ' (requires connection)' : ''}
              </option>
              {openBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatBatchOption(b)}
                </option>
              ))}
            </select>
            {newDisabledOffline && (
              <p className="text-sm text-gray-400 mt-1">
                Creating new batches requires connection — you can still add to open batches.
              </p>
            )}
            {errors?.batch && (
              <p className="text-sm text-red-500 mt-1">{errors.batch}</p>
            )}
          </div>

          {isNew && (
            <div>
              <label className="field-label">New batch</label>
              <div className="input-field bg-gray-50 text-gray-700">
                {newBatch ? `${newBatch.batch_id} — ${newBatch.location}` : 'Allocating…'}
              </div>
            </div>
          )}

          <div>
            <NumberInput
              label="Volume collected"
              value={volume}
              onChange={onVolumeChange}
              unit="L"
              step={10}
              min={0}
            />
            {errors?.volume && (
              <p className="text-sm text-red-500 mt-1">{errors.volume}</p>
            )}
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              onBlur={onTextBlur}
              rows={2}
              placeholder="Colour, smell, anything notable..."
              className="input-field text-base"
            />
          </div>

          {!isNew && batchChoice !== '' && (
            <Toggle
              label="Mark this batch as closed (IBC full)"
              value={closeBatch}
              onToggle={() => onCloseBatchChange(!closeBatch)}
              hint="Closes the batch after saving this fill."
            />
          )}
        </div>
      )}
    </>
  )
}
