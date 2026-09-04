'use client'

import { useAccount } from 'wagmi'
import { useOwnedImpId } from '@/hooks/useSpireth'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { formatFloorLabel } from '@/lib/leaderboardUtils'
import { FLOOR_MAX, FLOOR_MIN } from '@/lib/gameUtils'

export function Leaderboard({
  selectedImpId,
  onSelectImp,
}: {
  selectedImpId?: bigint | null
  onSelectImp?: (id: bigint) => void
}) {
  const { address } = useAccount()
  const { impId: ownedImpId } = useOwnedImpId(address)
  const { topEntries, aliveCount, totalPlayers, isLoading, isEmpty } = useLeaderboard(10)

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-200 mb-1 flex items-center gap-2">
        <span className="text-2xl">🏔</span>
        Leaderboard
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        Ranked by |floor| toward Summit (+{FLOOR_MAX}) / Abyss ({FLOOR_MIN})
      </p>

      <div className="mb-4 rounded-lg bg-zinc-800/50 px-3 py-2">
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          Total alive Pepes competing
        </div>
        <div className="text-lg font-bold text-emerald-400">
          {isLoading ? '...' : aliveCount}
        </div>
      </div>

      {isEmpty ? (
        <p className="text-sm text-zinc-500 text-center py-4">
          No Pepes have joined yet. Be the first!
        </p>
      ) : isLoading && topEntries.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-4">Loading ranks...</p>
      ) : (
        <div className="space-y-1">
          {topEntries.map((entry, index) => {
            const isOwned =
              ownedImpId !== null && entry.id === ownedImpId
            const isSelected = selectedImpId !== null && selectedImpId !== undefined && entry.id === selectedImpId
            const rank = index + 1

            return (
              <button
                key={entry.id.toString()}
                type="button"
                onClick={() => onSelectImp?.(entry.id)}
                disabled={!onSelectImp}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-violet-500/20 ring-1 ring-violet-400/50'
                    : isOwned
                      ? 'bg-violet-500/15 ring-1 ring-violet-500/40'
                      : 'hover:bg-zinc-800/50'
                } ${onSelectImp ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="w-6 text-right font-mono text-zinc-500">
                  {rank}
                </span>
                <span
                  className={`flex-1 font-medium ${
                    isOwned || isSelected ? 'text-violet-300' : 'text-zinc-200'
                  }`}
                >
                  Pepe #{entry.id.toString()}
                  {isOwned && (
                    <span className="ml-1 text-xs text-violet-400">(you)</span>
                  )}
                </span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    entry.height > 0
                      ? 'text-emerald-400'
                      : entry.height < 0
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }`}
                >
                  {formatFloorLabel(entry.height)}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    entry.isDead
                      ? 'bg-zinc-700/60 text-zinc-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {entry.isDead ? 'Dead' : 'Alive'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!isEmpty && totalPlayers > topEntries.length && (
        <p className="mt-3 text-xs text-zinc-600 text-center">
          Showing top {topEntries.length} of {totalPlayers} Pepes
        </p>
      )}
    </div>
  )
}
