import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function PinLogin({ onLogin }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleKey = useCallback((digit) => {
    setError(false)
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + digit
      if (next.length === 4) {
        // Auto-submit on 4th digit
        setTimeout(() => checkPin(next), 100)
      }
      return next
    })
  }, [])

  const handleBackspace = useCallback(() => {
    setError(false)
    setPin((prev) => prev.slice(0, -1))
  }, [])

  async function checkPin(code) {
    setChecking(true)
    const { data, error: err } = await supabase
      .from('operators')
      .select('id, name')
      .eq('pin', code)
      .maybeSingle()

    if (data) {
      sessionStorage.setItem('grip_operator_id', data.id)
      sessionStorage.setItem('grip_operator_name', data.name)
      onLogin(data)
    } else {
      setError(true)
      setPin('')
      if (navigator.vibrate) navigator.vibrate([50, 30, 50])
    }
    setChecking(false)
  }

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full transition-all duration-150 ${
        i < pin.length ? 'bg-primary scale-110' : 'bg-gray-300'
      }`}
    />
  ))

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-primary mb-1">TimberLoop</h1>
        <p className="text-gray-500 text-sm">Enter your 4-digit PIN</p>
      </div>

      {/* PIN dots */}
      <div
        className={`flex gap-4 mb-3 ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
      >
        {dots}
      </div>

      {/* Error message */}
      <div className="h-6 mb-6">
        {error && (
          <p className="text-red-500 text-sm font-semibold animate-[shake_0.4s_ease-in-out]">
            Invalid PIN
          </p>
        )}
      </div>

      {/* Number pad */}
      <div className="w-full max-w-xs space-y-3">
        {keys.map((row, ri) => (
          <div key={ri} className="flex gap-3 justify-center">
            {row.map((key, ki) => {
              if (key === '') {
                return <div key={ki} className="w-20 h-16" />
              }
              if (key === 'back') {
                return (
                  <button
                    key={ki}
                    type="button"
                    onClick={handleBackspace}
                    disabled={checking}
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
                  onClick={() => handleKey(key)}
                  disabled={checking}
                  className="w-20 h-16 rounded-2xl bg-white border-2 border-gray-200 text-2xl font-bold text-gray-800 active:bg-primary active:text-white active:border-primary transition-colors"
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
