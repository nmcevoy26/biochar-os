import { useState, useEffect, useRef } from 'react'

const THRESHOLD = 80

async function hardReload() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.unregister()
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch (e) { /* ignore */ }
  window.location.reload()
}

export default function PullToRefresh({ children }) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef(0)
  const pullingRef = useRef(false)
  const pullYRef = useRef(0)

  useEffect(() => {
    function onTouchStart(e) {
      if (window.scrollY <= 0 && !refreshing) {
        startYRef.current = e.touches[0].clientY
        pullingRef.current = true
      }
    }

    function onTouchMove(e) {
      if (!pullingRef.current) return
      const diff = e.touches[0].clientY - startYRef.current
      if (diff > 0 && window.scrollY <= 0) {
        const y = Math.min(diff * 0.4, 120)
        pullYRef.current = y
        setPullY(y)
        if (diff > 10) e.preventDefault()
      } else {
        pullingRef.current = false
        pullYRef.current = 0
        setPullY(0)
      }
    }

    function onTouchEnd() {
      if (pullingRef.current && pullYRef.current >= THRESHOLD) {
        setRefreshing(true)
        hardReload()
        return
      }
      pullingRef.current = false
      pullYRef.current = 0
      setPullY(0)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [refreshing])

  const pastThreshold = pullY >= THRESHOLD
  const showIndicator = pullY > 10 || refreshing

  return (
    <>
      {showIndicator && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none"
          style={{ top: refreshing ? 60 : pullY - 20 }}
        >
          <div className="bg-white rounded-full shadow-lg w-10 h-10 flex items-center justify-center">
            {refreshing ? (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  pastThreshold ? 'rotate-180 text-green-600' : 'text-gray-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  )
}
