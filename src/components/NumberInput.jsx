export default function NumberInput({ label, value, onChange, unit, step = 1, min, max, placeholder }) {
  const numVal = value === '' || value == null ? '' : Number(value)

  function adjust(delta) {
    const current = numVal === '' ? 0 : numVal
    let next = +(current + delta).toFixed(4)
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-step)}
          className="w-12 h-12 rounded-xl bg-gray-200 text-2xl font-bold active:bg-gray-300 flex-shrink-0 flex items-center justify-center"
        >
          -
        </button>
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={placeholder}
            className="input-field text-center pr-12"
            min={min}
            max={max}
            step={step}
          />
          {unit && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => adjust(step)}
          className="w-12 h-12 rounded-xl bg-gray-200 text-2xl font-bold active:bg-gray-300 flex-shrink-0 flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  )
}
