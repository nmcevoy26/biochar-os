import { useState, useEffect } from 'react'
import TabBar from './components/TabBar'
import Today from './pages/Today'
import DailySheet from './pages/DailySheet'
import WeeklySample from './pages/WeeklySample'
import PinLogin from './pages/PinLogin'
import { supabase } from './lib/supabase'
import { flushQueue, getQueue } from './lib/offline'

export default function App() {
  const [tab, setTab] = useState('daily')
  const [online, setOnline] = useState(navigator.onLine)
  const [queueCount, setQueueCount] = useState(0)
  const [operator, setOperator] = useState(() => {
    const id = sessionStorage.getItem('grip_operator_id')
    const name = sessionStorage.getItem('grip_operator_name')
    return id && name ? { id, name } : null
  })

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      flushQueue(supabase).then(() => setQueueCount(getQueue().length))
    }
    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) {
      flushQueue(supabase).then(() => setQueueCount(getQueue().length))
    }

    const interval = setInterval(() => setQueueCount(getQueue().length), 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  if (!operator) {
    return <PinLogin onLogin={setOperator} />
  }

  function handleLogout() {
    sessionStorage.removeItem('grip_operator_id')
    sessionStorage.removeItem('grip_operator_name')
    setOperator(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Offline banner */}
      {!online && (
        <div className="bg-orange-500 text-white text-center py-2 text-sm font-semibold sticky top-0 z-50">
          Offline — changes will sync when reconnected
        </div>
      )}

      {/* Header */}
      <header className="bg-primary text-white px-4 pt-[env(safe-area-inset-top,12px)] pb-3 flex flex-col items-center sticky top-0 z-40">
        <h1 className="text-lg font-bold leading-tight text-center">TimberLoop Production Sheet</h1>
        <div className="flex items-center gap-3 mt-1">
          {queueCount > 0 && (
            <span className="bg-orange-400 text-xs font-bold px-2 py-1 rounded-full">
              {queueCount} queued
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-white/80 text-sm font-semibold active:text-white"
          >
            {operator.name}
          </button>
        </div>
      </header>

      {/* Page content */}
      <main>
        {tab === 'today' && <Today />}
        {tab === 'daily' && <DailySheet online={online} operator={operator} />}
        {tab === 'weekly' && <WeeklySample online={online} />}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
