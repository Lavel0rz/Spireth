'use client'

import type { SimStats as SimStatsData } from '@/hooks/useSimulateCompetition'

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function SimStats({ stats }: { stats: SimStatsData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 border border-amber-800/40 bg-amber-950/20 rounded-lg px-2.5 py-1.5">
      <span>
        Prize pool <span className="text-violet-300 font-semibold">{formatUsd(stats.prizePoolUsd)}</span>
      </span>
      <span>
        Dev <span className="text-amber-300 font-semibold">{formatUsd(stats.devPayoutUsd)}</span>
      </span>
      <span>
        Rolls <span className="text-zinc-200 font-semibold">{stats.rolls.toLocaleString()}</span>
      </span>
      <span>
        Living <span className="text-emerald-300 font-semibold">{stats.livingCount}</span>
      </span>
      <span>
        Quit <span className="text-red-400 font-semibold">{stats.deadCount}</span>
      </span>
      <span>
        Wave <span className="text-zinc-300 font-semibold">{stats.waves}</span>
      </span>
    </div>
  )
}
