'use client'

import { useSeasonState, usePrizePool, useTotalMinted, useSignupTimeRemaining, useSeasonTimeRemaining } from '@/hooks/useSpireth'
import { formatEther } from 'viem'

const SEASON_STATES = ['Signup', 'Live', 'Frozen']

function formatTime(seconds: bigint): string {
  const s = Number(seconds)
  if (s <= 0) return '0s'
  
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = s % 60
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 && days === 0) parts.push(`${secs}s`)
  
  return parts.join(' ') || '0s'
}

export function SeasonInfo() {
  const { data: seasonState } = useSeasonState()
  const { data: prizePool } = usePrizePool()
  const { data: totalMinted } = useTotalMinted()
  const { data: signupTime } = useSignupTimeRemaining()
  const { data: seasonTime } = useSeasonTimeRemaining()

  const state = seasonState !== undefined ? SEASON_STATES[Number(seasonState)] : '...'
  const pool = prizePool !== undefined ? formatEther(prizePool as bigint) : '...'
  const minted = totalMinted !== undefined ? Number(totalMinted) : '...'

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        <span className="text-2xl">◈</span>
        Season Status
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-zinc-500">State</div>
          <div className={`text-lg font-bold ${
            state === 'Live' ? 'text-emerald-400' : 
            state === 'Signup' ? 'text-amber-400' : 
            state === 'Frozen' ? 'text-cyan-400' : 'text-zinc-400'
          }`}>
            {state}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Prize Pool</div>
          <div className="text-lg font-bold text-violet-400">{pool} ETH</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Imps Minted</div>
          <div className="text-lg font-bold text-zinc-200">{minted}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            {state === 'Signup' ? 'Signup Ends' : state === 'Live' ? 'Max Duration' : 'Season'}
          </div>
          <div className="text-lg font-bold text-zinc-200">
            {state === 'Signup' && signupTime !== undefined
              ? formatTime(signupTime as bigint)
              : state === 'Live' && seasonTime !== undefined
              ? formatTime(seasonTime as bigint)
              : state === 'Frozen'
              ? 'Ended'
              : '...'}
          </div>
        </div>
      </div>
    </div>
  )
}
