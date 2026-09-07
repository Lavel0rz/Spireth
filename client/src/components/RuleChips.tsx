const CHIPS = [
  { icon: '⬥', label: 'Board', detail: '±50 floors' },
  { icon: '🎲', label: 'Dice', detail: '±1 to ±4' },
  { icon: '⏰', label: 'Roll', detail: '24h→1h ladder' },
  { icon: '💀', label: 'Death', detail: '72h idle' },
  { icon: '🏆', label: 'Bell', detail: '+20% bonus' },
] as const

export function RuleChips() {
  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-400 mb-3">How It Works</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CHIPS.map((chip) => (
          <div
            key={chip.label}
            className="bg-zinc-800/50 rounded-lg p-3 text-center"
          >
            <div className="text-xl mb-0.5">{chip.icon}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{chip.label}</div>
            <div className="text-xs font-medium text-zinc-200">{chip.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
