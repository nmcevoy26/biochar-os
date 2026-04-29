import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => { registration.update() }, 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div
      onClick={() => updateServiceWorker(true)}
      className="bg-blue-600 text-white text-center py-2 text-sm font-semibold active:bg-blue-700"
    >
      Update available — tap to reload
    </div>
  )
}
