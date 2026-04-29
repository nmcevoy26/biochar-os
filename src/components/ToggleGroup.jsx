export default function ToggleGroup({ label, options, value, onChange }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex gap-2">
        {options.map((opt) => {
          const optValue = typeof opt === 'string' ? opt : opt.value
          const optLabel = typeof opt === 'string' ? opt : opt.label
          const active = value === optValue
          return (
            <button
              key={optValue}
              type="button"
              onClick={() => onChange(optValue)}
              className={`flex-1 py-3.5 rounded-xl text-lg font-bold transition-colors border-2 ${
                active
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 active:bg-gray-100'
              }`}
            >
              {optLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}
