import { useState, useRef, useCallback } from 'react'

const THRESHOLD = 80
const REVEAL_WIDTH = 90

export default function SwipeCard({ children, onDelete }) {
  const cardRef = useRef(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const swiping = useRef(false)
  const [offset, setOffset] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const handleTouchStart = useCallback((e) => {
    if (revealed) {
      setTransitioning(true)
      setOffset(0)
      setRevealed(false)
      return
    }
    swiping.current = true
    startX.current = e.touches[0].clientX
    currentX.current = 0
    setTransitioning(false)
  }, [revealed])

  const handleTouchMove = useCallback((e) => {
    if (!swiping.current) return
    const diff = e.touches[0].clientX - startX.current
    if (diff < 0) {
      currentX.current = diff
      setOffset(diff)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!swiping.current) return
    swiping.current = false
    setTransitioning(true)
    if (currentX.current < -THRESHOLD) {
      setOffset(-REVEAL_WIDTH)
      setRevealed(true)
    } else {
      setOffset(0)
      setRevealed(false)
    }
  }, [])

  function handleDelete() {
    if (confirm('Delete this run and all its bags?')) {
      onDelete()
    }
    setTransitioning(true)
    setOffset(0)
    setRevealed(false)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex items-center z-0">
        <button
          onClick={handleDelete}
          className="bg-red-500 text-white font-bold h-full px-6 flex items-center text-base"
          style={{ width: REVEAL_WIDTH }}
        >
          Delete
        </button>
      </div>
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative z-10 ${transitioning ? 'transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTransitionEnd={() => setTransitioning(false)}
      >
        {children}
      </div>
    </div>
  )
}
