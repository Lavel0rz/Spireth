export interface LeaderboardEntry {
  id: bigint
  height: number
  isDead: boolean
  owner: string
}

export function formatFloorLabel(height: number): string {
  if (height > 0) return `+${height}`
  return String(height)
}

/** Closest to Summit (+25) or Abyss (-25) wins; ties prefer higher height, then lower id. */
export function compareLeaderboard(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const absDiff = Math.abs(b.height) - Math.abs(a.height)
  if (absDiff !== 0) return absDiff

  const heightDiff = b.height - a.height
  if (heightDiff !== 0) return heightDiff

  return Number(a.id - b.id)
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(compareLeaderboard)
}
