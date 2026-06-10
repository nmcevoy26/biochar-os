import { useState, useEffect, useCallback } from 'react'
import TabBar from './components/TabBar'
import Today from './pages/Today'
import DailySheet from './pages/DailySheet'
import WeeklySample from './pages/WeeklySample'
import PinLogin from './pages/PinLogin'
import UpdateBanner from './components/UpdateBanner'
import PullToRefresh from './components/PullToRefresh'
import { supabase } from './lib/supabase'
import { flushQueue, getQueue } from './lib/offline'
import { operatorSignOut, sessionMatchesOperator } from './lib/operatorAuth'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [online, setOnline] = useState(navigator.onLine)
  const [queueCount, setQueueCount] = useState(0)
  const [reauthNeeded, setReauthNeeded] = useState(false)
  const [operator, setOperator] = useState(() => {
    const id = sessionStorage.getItem('grip_operator_id')
    const name = sessionStorage.getItem('grip_operator_name')
    return id && name ? { id, name } : null
  })

  // Drain guard: never replay the queue without a live session. getSession()
  // awaits the token refresh when the access token has expired (a >1hr-offline
  // reconnect), so the drain can't race a stale JWT. An unrefreshable session
  // (revoked / expired refresh token) keeps the queue and asks for a re-PIN.
  const drain = useCallback(async () => {
    if (getQueue().length === 0) {
      setQueueCount(0)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // Session died mid-shift (revoked, or expired past its refresh token):
      // drop to the PIN screen so the operator sees the re-PIN-to-sync notice
      // instead of a silently stuck queue badge.
      setReauthNeeded(true)
      setQueueCount(getQueue().length)
      await operatorSignOut()
      setOperator(null)
      return
    }
    await flushQueue(supabase)
    setReauthNeeded(false)
    setQueueCount(getQueue().length)
  }, [])

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      drain()
    }
    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) {
      drain()
    }

    const interval = setInterval(() => setQueueCount(getQueue().length), 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [drain])

  // Launch reconciliation: a sessionStorage identity is only trusted when the
  // persisted session belongs to the same operator (app_metadata.operator_id).
  // Mismatch or missing session -> sign out locally and drop to the PIN screen.
  useEffect(() => {
    if (!operator) return
    let cancelled = false
    sessionMatchesOperator(operator.id).then((matches) => {
      if (cancelled || matches) return
      operatorSignOut().then(() => {
        if (!cancelled) setOperator(null)
      })
    })
    return () => {
      cancelled = true
    }
  }, [operator])

  // A fresh login can drain whatever the previous session left queued.
  useEffect(() => {
    if (operator && navigator.onLine) drain()
  }, [operator, drain])

  async function handleLogout() {
    await operatorSignOut()
    setOperator(null)
  }

  return (
    <PullToRefresh>
      <UpdateBanner />
      {!operator ? (
        <PinLogin
          onLogin={setOperator}
          notice={
            reauthNeeded && queueCount > 0
              ? 'Session expired — enter your PIN to sync queued changes'
              : null
          }
        />
      ) : (
        <div className="min-h-screen bg-gray-50">
          {/* Offline banner */}
          {!online && (
            <div className="bg-orange-500 text-white text-center py-2 text-sm font-semibold sticky top-0 z-50">
              Offline — changes will sync when reconnected
            </div>
          )}

          {/* Header */}
          <header className="bg-primary text-white px-4 pt-[env(safe-area-inset-top,12px)] pb-3 sticky top-0 z-40">
            <div className="relative flex items-center justify-center">
              <h1 className="text-lg font-bold leading-tight text-center">TimberLoop Production Sheet</h1>
              <button
                onClick={handleLogout}
                className="absolute right-0 text-white/70 text-sm active:text-white"
              >
                Log out
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-1">
              {queueCount > 0 && (
                <span className="bg-orange-400 text-xs font-bold px-2 py-1 rounded-full">
                  {queueCount} queued
                </span>
              )}
              <span className="text-white/80 text-sm font-semibold">{operator.name}</span>
            </div>
          </header>

          {/* Page content */}
          <main>
            {tab === 'today' && <Today />}
            {tab === 'daily' && (
              <DailySheet
                online={online}
                operator={operator}
                queueCount={queueCount}
                onQueueChange={() => setQueueCount(getQueue().length)}
              />
            )}
            {tab === 'weekly' && <WeeklySample online={online} />}
          </main>

          <TabBar active={tab} onChange={setTab} />
        </div>
      )}
    </PullToRefresh>
  )
}
