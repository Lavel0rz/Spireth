/** Roll cooldown ladder — must match on-chain TheSpireth._rollCooldown(). */
export const ROLL_LADDER_STEPS = 6

export const ROLL_COOLDOWN_LADDER_SECONDS = [
  24 * 3600,
  12 * 3600,
  6 * 3600,
  3 * 3600,
  2 * 3600,
  1 * 3600,
] as const

export function rollCooldownSeconds(completedRolls: number): number {
  if (completedRolls <= 0) return 0
  if (completedRolls >= ROLL_LADDER_STEPS) return ROLL_COOLDOWN_LADDER_SECONDS[ROLL_LADDER_STEPS - 1]
  return ROLL_COOLDOWN_LADDER_SECONDS[completedRolls - 1]
}

export function formatRollLadderLabel(step: number, totalSteps: number, waitSeconds: number): string {
  const stepLabel = `step ${step}/${totalSteps}`
  if (waitSeconds <= 0) return `${stepLabel} · ready`
  return `${stepLabel} · next in ${formatCooldownWait(waitSeconds)}`
}

function formatCooldownWait(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 && days === 0) parts.push(`${secs}s`)
  return parts.join(' ') || '0s'
}
