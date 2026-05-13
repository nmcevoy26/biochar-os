const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
]

export default function PinKeypad({ onKey, onBackspace, disabled }) {
  return (
    <div className="w-full max-w-xs space-y-3">
      {KEYS.map((row, ri) => (
        <div key={ri} className="flex gap-3 justify-center">
          {row.map((key, ki) => {
            if (key === '') return <div key={ki} className="w-20 h-16" />
            if (key === 'back') {
              return (
                <button
                  key={ki}
                  type="button"
                  onClick={onBackspace}
                  disabled={disabled}
                  className="w-20 h-16 rounded-2xl flex items-center justify-center active:bg-gray-200 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7 text-gray-600">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M18 9l-6 6M12 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )
            }
            return (
              <button
                key={ki}
                type="button"
                onClick={() => onKey(key)}
                disabled={disabled}
                className="w-20 h-16 rounded-2xl bg-white border-2 border-gray-200 text-2xl font-bold text-gray-800 active:bg-primary active:text-white active:border-primary transition-colors"
              >
                {key}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
