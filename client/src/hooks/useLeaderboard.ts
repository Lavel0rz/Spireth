'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTotalMinted } from '@/hooks/useSpireth'
import {
  sortLeaderboard,
  type LeaderboardEntry,
} from '@/lib/leaderboardUtils'

const POLL_INTERVAL_MS = 5000

export function useLeaderboard(topN = 10) {
  const { data: totalMinted } = useTotalMinted()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  useEffect(() => {
    let cancelled = false

    if (total === 0) {
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          setEntries([])
          setIsLoading(false)
        }
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    const fetchEntries = async () => {
      setIsLoading(true)
      const results = await Promise.all(
        Array.from({ length: total }, (_, i) =>
          fetch(`/api/imp/${i}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      )

      if (cancelled) return

      const validEntries: LeaderboardEntry[] = results
        .filter(Boolean)
        .map((imp, i) => ({
          id: BigInt(i),
          height: imp.height as number,
          isDead: imp.isDead as boolean,
          owner: imp.owner as string,
        }))

      setEntries(validEntries)
      setIsLoading(false)
    }

    fetchEntries()
    const interval = window.setInterval(fetchEntries, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [total])

  const sorted = useMemo(() => sortLeaderboard(entries), [entries])
  const topEntries = useMemo(() => sorted.slice(0, topN), [sorted, topN])
  const aliveCount = useMemo(
    () => entries.filter((entry) => !entry.isDead).length,
    [entries],
  )

  return {
    topEntries,
    aliveCount,
    totalPlayers: entries.length,
    isLoading: totalMinted === undefined || isLoading,
    isEmpty: total === 0,
  }
}
