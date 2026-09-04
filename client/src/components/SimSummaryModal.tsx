'use client'

import type { SimSummary } from '@/hooks/useSimulateCompetition'
import { BELL_BONUS_PCT } from '@/hooks/useSimulateCompetition'
import { FLOOR_MAX, FLOOR_MIN } from '@/lib/gameUtils'

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function SimSummaryModal({
  summary,
  onDismiss,
  onRunAgain,
}: {
  summary: SimSummary
  onDismiss: () => void
  onRunAgain: () => void
}) {
  const isSummit = summary.outcome === 'summit'
  const outcomeLabel = isSummit ? `Summit (+${FLOOR_MAX})` : `Abyss (${FLOOR_MIN})`

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-labelledby="sim-summary-title"
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900/95 p-5 shadow-2xl"
      >
        <h3 id="sim-summary-title" className="text-lg font-semibold text-zinc-100 mb-1">
          Competition over
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          Pepe #{summary.winnerId.toString()} rang the bell at {outcomeLabel}.
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Winner</div>
            <div className="font-semibold text-zinc-100">Pepe #{summary.winnerId.toString()}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Final floor</div>
            <div className={`font-semibold ${isSummit ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.finalHeight > 0 ? `+${summary.finalHeight}` : summary.finalHeight}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total rolls</div>
            <div className="font-semibold text-zinc-100">{summary.totalRolls.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total spent</div>
            <div className="font-semibold text-zinc-100">{formatUsd(summary.totalSpentUsd)}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Prize pool</div>
            <div className="font-semibold text-violet-300">{formatUsd(summary.prizePoolUsd)}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Dev payout</div>
            <div className="font-semibold text-amber-300">{formatUsd(summary.devPayoutUsd)}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Waves</div>
            <div className="font-semibold text-zinc-100">{summary.waves}</div>
          </div>
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Duration</div>
            <div className="font-semibold text-zinc-100">{formatDuration(summary.durationMs)}</div>
          </div>
        </div>

        <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2.5 text-xs text-amber-100/90 mb-5">
          <span className="font-semibold text-amber-200">Bell bonus:</span>{' '}
          Pepe #{summary.winnerId.toString()} earns {formatUsd(summary.bellBonusUsd)} (
          {BELL_BONUS_PCT}% of pool). Remaining pool for survivors:{' '}
          {formatUsd(summary.remainingPoolUsd)} across {summary.livingAtEnd} living Pepes.
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 transition-colors"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onRunAgain}
            className="text-xs px-3 py-1.5 rounded border border-amber-700/60 bg-amber-900/50 text-amber-200 hover:bg-amber-800/50 transition-colors"
          >
            Run again
          </button>
        </div>
      </div>
    </div>
  )
}
