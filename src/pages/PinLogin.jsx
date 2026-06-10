import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  pinLogin,
  PIN_OK,
  PIN_LOCKED,
  PIN_NOT_PROVISIONED,
  PIN_ERROR,
} from '../lib/operatorAuth'
import PinKeypad from '../components/PinKeypad'

const ERROR_MESSAGES = {
  invalid: 'Invalid PIN',
  network: 'Connection problem — try again',
  not_provisioned: 'No floor login yet — ask an admin to provision one',
}

export default function PinLogin({ onLogin, notice }) {
  const [operators, setOperators] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  const loadOperators = useCallback(async () => {
    setLoadError(false)
    setOperators(null)
    const { data, error: err } = await supabase.rpc('list_operators_for_login')
    if (err || !data) {
      setLoadError(true)
      setOperators([])
      return
    }
    setOperators([...data].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  useEffect(() => { loadOperators() }, [loadOperators])

  function pickOperator(op) {
    setSelected(op)
    setPin('')
    setError(null)
  }

  function backToPicker() {
    setSelected(null)
    setPin('')
    setError(null)
  }

  const verifyPin = useCallback(async (code) => {
    setChecking(true)
    const result = await pinLogin(selected.id, code)
    setChecking(false)
    if (result.status !== PIN_OK) {
      setPin('')
      if (result.status === PIN_LOCKED) {
        const minutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 900) / 60))
        setError(`Too many attempts — locked for ${minutes} min`)
      } else if (result.status === PIN_NOT_PROVISIONED) {
        setError(ERROR_MESSAGES.not_provisioned)
      } else if (result.status === PIN_ERROR) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(ERROR_MESSAGES.invalid)
      }
      if (navigator.vibrate) navigator.vibrate([50, 30, 50])
      return
    }
    sessionStorage.setItem('grip_operator_id', selected.id)
    sessionStorage.setItem('grip_operator_name', selected.name)
    onLogin({ id: selected.id, name: selected.name })
  }, [selected, onLogin])

  const handleKey = useCallback((digit) => {
    setError(null)
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + digit
      if (next.length === 4) setTimeout(() => verifyPin(next), 100)
      return next
    })
  }, [verifyPin])

  const handleBackspace = useCallback(() => {
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }, [])

  if (!selected) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        {notice && (
          <p className="mb-6 max-w-xs rounded-xl bg-orange-100 px-4 py-3 text-center text-sm font-semibold text-orange-700">
            {notice}
          </p>
        )}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary mb-1">TimberLoop</h1>
          <p className="text-gray-500 text-sm">Select your name</p>
        </div>
        {operators === null && !loadError && (
          <p className="text-gray-500 text-sm">Loading operators…</p>
        )}
        {loadError && (
          <div className="w-full max-w-xs text-center">
            <p className="text-red-500 text-sm font-semibold mb-4">
              Couldn't load operators — check your connection.
            </p>
            <button type="button" onClick={loadOperators} className="btn-primary">
              Retry
            </button>
          </div>
        )}
        {operators && !loadError && operators.length === 0 && (
          <p className="text-gray-500 text-sm">No operators found.</p>
        )}
        {operators && !loadError && operators.length > 0 && (
          <div className="w-full max-w-xs space-y-3">
            {operators.map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => pickOperator(op)}
                className="w-full py-5 rounded-2xl bg-white border-2 border-gray-200 text-xl font-bold text-gray-800 active:bg-primary active:text-white active:border-primary transition-colors"
              >
                {op.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full transition-all duration-150 ${
        i < pin.length ? 'bg-primary scale-110' : 'bg-gray-300'
      }`}
    />
  ))

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-center mb-6">
        <button
          type="button"
          onClick={backToPicker}
          disabled={checking}
          className="text-primary text-sm font-semibold mb-3 active:text-primary-light"
        >
          ← Change operator
        </button>
        <h1 className="text-2xl font-bold text-primary mb-1">{selected.name}</h1>
        <p className="text-gray-500 text-sm">Enter your 4-digit PIN</p>
      </div>
      <div className={`flex gap-4 mb-3 ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
        {dots}
      </div>
      <div className="h-6 mb-6">
        {error && (
          <p className="text-red-500 text-sm font-semibold animate-[shake_0.4s_ease-in-out]">
            {error}
          </p>
        )}
      </div>
      <PinKeypad onKey={handleKey} onBackspace={handleBackspace} disabled={checking} />
    </div>
  )
}
