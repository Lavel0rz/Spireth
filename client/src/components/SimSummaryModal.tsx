'use client'

import type { SimSummary } from '@/hooks/useSimulateCompetition'

interface SimSummaryModalProps {
  summary: SimSummary
  onClose: () => void
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function SimSummaryModal({ summary, onClose }: SimSummaryModalProps) {
  const {
    totalRolls,
    prizePoolUsd,
    bellBonusUsd,
    remainingPoolUsd,
    winnerId,
    winnerHeight,
    livingAtEnd,
    top10,
  } = summary

  const winnerLabel = winnerHeight > 0 ? 'Summit' : 'Abyss'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-amber-400">🔔</span>
            Competition Complete
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-zinc-500 text-xs mb-1">Winner</div>
            <div className="text-amber-400 font-medium">
              Pepe #{winnerId.toString()} ({winnerLabel} {winnerHeight > 0 ? '+' : ''}{winnerHeight})
            </div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-zinc-500 text-xs mb-1">Total Rolls</div>
            <div className="text-zinc-200 font-medium">{totalRolls.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-zinc-500 text-xs mb-1">Prize Pool</div>
            <div className="text-zinc-200 font-medium">{formatUsd(prizePoolUsd)}</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-zinc-500 text-xs mb-1">Living at End</div>
            <div className="text-zinc-200 font-medium">{livingAtEnd}</div>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-700/40 rounded-lg p-3 mb-4 text-sm">
          <div className="flex items-center gap-2 text-amber-300">
            <span>🔔</span>
            <span>
              Bell Bonus: <strong>{formatUsd(bellBonusUsd)}</strong> (20% of pool) → Pepe #{winnerId.toString()}
            </span>
          </div>
          <div className="text-zinc-400 text-xs mt-1">
            Remaining {formatUsd(remainingPoolUsd)} split among {livingAtEnd} living Pepes
          </div>
        </div>

        <div className="mb-3">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Top 10 — Spend vs Payout</h3>
          <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800/80 sticky top-0">
                  <tr className="text-zinc-400 text-left">
                    <th className="px-3 py-2 font-medium">Pepe</th>
                    <th className="px-2 py-2 font-medium text-right">Floor</th>
                    <th className="px-2 py-2 font-medium text-right">Spent</th>
                    <th className="px-2 py-2 font-medium text-right">Paid</th>
                    <th className="px-3 py-2 font-medium text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/50">
                  {top10.map((entry) => (
                    <tr
                      key={entry.id.toString()}
                      className={entry.isWinner ? 'bg-amber-950/20' : 'hover:bg-zinc-800/40'}
                    >
                      <td className="px-3 py-2 text-zinc-200">
                        #{entry.id.toString()}
                        {entry.isWinner && (
                          <span className="ml-1 text-amber-400" title="Winner">🔔</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-300">
                        {entry.height > 0 ? '+' : ''}{entry.height}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-400">
                        {formatUsd(entry.spentUsd)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-300">
                        {formatUsd(entry.payoutUsd)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-medium ${
                          entry.netUsd >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {entry.netUsd >= 0 ? '+' : ''}{formatUsd(entry.netUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
