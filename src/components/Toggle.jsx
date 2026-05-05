export default function Toggle({ label, value, onToggle }) {
  return (
    <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-xl px-4 py-3.5">
      <span className="text-lg font-semibold">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`w-14 h-8 rounded-full transition-colors flex items-center ${
          value ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
