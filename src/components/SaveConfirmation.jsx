import { useEffect, useState } from 'react'

export default function SaveConfirmation({ show, onDone }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onDone?.()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [show])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-3xl p-12 flex flex-col items-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-10 h-10">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-gray-800">Saved</span>
      </div>
    </div>
  )
}
