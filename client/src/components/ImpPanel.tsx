'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import {
  useImp,
  useCanRoll,
  useTimeUntilDeath,
  useTimeUntilNextRoll,
  usePendingRoll,
  useRollCost,
  useSeasonState,
  useHasMinted,
  useMint,
  useCommitRoll,
  useRevealRoll,
  useImpPrize,
  useClaim,
  useEquippedPfp,
  useEquipPfp,
  useClearPfp,
} from '@/hooks/useSpireth'
import { useGameAnimation } from '@/context/GameAnimationContext'

function formatTime(seconds: bigint | number | undefined): string {
  if (seconds === undefined) return '...'
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

const ZERO = BigInt(0)

export function ImpPanel({ impId }: { impId: bigint | null }) {
  const { address } = useAccount()
  const { data: seasonState } = useSeasonState()
  const { data: hasMinted } = useHasMinted(address)
  const { data: rollCost } = useRollCost()
  
  const { data: impData } = useImp(impId ?? ZERO)
  const { data: canRoll } = useCanRoll(impId ?? ZERO)
  const { data: timeUntilDeath } = useTimeUntilDeath(impId ?? ZERO)
  const { data: timeUntilNextRoll } = useTimeUntilNextRoll(impId ?? ZERO)
  const { data: pendingRoll } = usePendingRoll(impId ?? ZERO)
  const { data: impPrize } = useImpPrize(impId ?? ZERO)
  
  const { mint, isPending: isMinting, isConfirming: isMintConfirming } = useMint()
  const { commitRoll, isPending: isCommitting, isConfirming: isCommitConfirming } = useCommitRoll(impId ?? ZERO)
  const { revealRoll, isPending: isRevealing, isConfirming: isRevealConfirming } = useRevealRoll(impId ?? ZERO)
  const { claim, isPending: isClaiming, isConfirming: isClaimConfirming } = useClaim(impId ?? ZERO)
  const { data: equippedPfp } = useEquippedPfp(impId ?? ZERO)
  const { equipPfp, isPending: isEquipping, isConfirming: isEquipConfirming } = useEquipPfp(impId ?? ZERO)
  const { clearPfp, isPending: isClearing, isConfirming: isClearConfirming } = useClearPfp(impId ?? ZERO)
  
  const { triggerCommit, triggerRevealPending } = useGameAnimation()

  const [pendingSecret, setPendingSecret] = useState<bigint | null>(() => {
    if (typeof window === 'undefined' || impId === null) return null
    const stored = localStorage.getItem(`spireth_secret_${impId}`)
    return stored ? BigInt(stored) : null
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPfpForm, setShowPfpForm] = useState(false)
  const [pfpContract, setPfpContract] = useState('')
  const [pfpTokenId, setPfpTokenId] = useState('')

  const isSignup = seasonState !== undefined && BigInt(seasonState as bigint) === ZERO
  const isLive = seasonState !== undefined && BigInt(seasonState as bigint) === BigInt(1)
  const isFrozen = seasonState !== undefined && BigInt(seasonState as bigint) === BigInt(2)
  
  const impDataArray = impData as [number, bigint, bigint, boolean, boolean, string] | undefined
  const height = impDataArray ? impDataArray[0] : 0
  const isDead = impDataArray ? impDataArray[3] : false
  const hasClaimed = impDataArray ? impDataArray[4] : false
  const owner = impDataArray ? impDataArray[5] : ''
  
  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase()
  
  const pendingRollArray = pendingRoll as [string, bigint, boolean, boolean] | undefined
  const pending = pendingRollArray ? pendingRollArray[2] : false
  const expired = pendingRollArray ? pendingRollArray[3] : false
  
  const equippedPfpArray = equippedPfp as [string, bigint] | undefined
  const pfpNft = equippedPfpArray ? equippedPfpArray[0] : '0x0000000000000000000000000000000000000000'
  const pfpTokenIdValue = equippedPfpArray ? equippedPfpArray[1] : ZERO
  const hasPfp = pfpNft !== '0x0000000000000000000000000000000000000000'
  
  const handleEquipPfp = () => {
    if (pfpContract && pfpTokenId) {
      equipPfp(pfpContract as `0x${string}`, BigInt(pfpTokenId))
      setShowPfpForm(false)
      setPfpContract('')
      setPfpTokenId('')
    }
  }

  const handleRoll = () => {
    const secret = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
    setPendingSecret(secret)
    if (impId !== null) {
      localStorage.setItem(`spireth_secret_${impId}`, secret.toString())
      triggerCommit(impId)
    }
    commitRoll(secret)
  }

  const handleReveal = () => {
    let secret = pendingSecret
    if (!secret && impId !== null) {
      const stored = localStorage.getItem(`spireth_secret_${impId}`)
      if (stored) secret = BigInt(stored)
    }
    if (secret) {
      if (impId !== null) triggerRevealPending(impId)
      revealRoll(secret)
      if (impId !== null) {
        localStorage.removeItem(`spireth_secret_${impId}`)
      }
      setPendingSecret(null)
    }
  }

  useEffect(() => {
    if (impId === null) return
    const stored = localStorage.getItem(`spireth_secret_${impId}`)
    const timer = window.setTimeout(() => {
      setPendingSecret(stored ? BigInt(stored) : null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [impId])

  if (!address) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Your Imp</h2>
        <p className="text-zinc-400">Connect your wallet to play.</p>
      </div>
    )
  }

  if (isSignup && !hasMinted) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Join the Spireth</h2>
        <p className="text-zinc-400 mb-4">
          One character per wallet. Join free during signup and appear on the tower.
        </p>
        <button
          onClick={() => mint()}
          disabled={isMinting || isMintConfirming}
          className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
        >
          {isMinting ? 'Confirm in wallet…' : isMintConfirming ? 'Joining…' : 'Join the Spireth'}
        </button>
      </div>
    )
  }

  if (!hasMinted && !isSignup) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Signup Closed</h2>
        <p className="text-zinc-400">
          The signup window has ended. Watch the race unfold!
        </p>
      </div>
    )
  }

  if (impId === null) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Your Imp</h2>
        <p className="text-zinc-400">Select an Imp on the board or enter its ID.</p>
      </div>
    )
  }

  const timeUntilDeathNum = timeUntilDeath !== undefined ? Number(timeUntilDeath as bigint) : 0
  const timeUntilNextRollNum = timeUntilNextRoll !== undefined ? Number(timeUntilNextRoll as bigint) : 0
  const prizeValue = impPrize !== undefined ? (impPrize as bigint) : ZERO

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6 space-y-4">
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold text-zinc-200">
          Imp #{impId.toString()}
          {isDead && <span className="ml-2 text-red-400 text-sm">(Dead)</span>}
        </h2>
        {isOwner && <span className="text-xs px-2 py-1 bg-violet-500/20 text-violet-400 rounded">Yours</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">Floor</div>
          <div className={`text-2xl font-bold ${
            height > 0 ? 'text-emerald-400' : height < 0 ? 'text-red-400' : 'text-amber-400'
          }`}>
            {height > 0 ? `+${height}` : height}
          </div>
        </div>
        
        {!isDead && !isFrozen && (
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Death In</div>
            <div className={`text-lg font-bold ${
              timeUntilDeathNum < 3600 ? 'text-red-400 animate-pulse' : 
              timeUntilDeathNum < 86400 ? 'text-amber-400' : 'text-zinc-200'
            }`}>
              {formatTime(timeUntilDeath as bigint | undefined)}
            </div>
          </div>
        )}
      </div>

      {isOwner && isLive && !isDead && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          {pending ? (
            <div className="space-y-3">
              <div className="text-sm text-amber-400">
                Roll pending - reveal to complete!
              </div>
              <button
                onClick={handleReveal}
                disabled={isRevealing || isRevealConfirming || expired}
                className="w-full px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {isRevealing ? 'Confirming...' : isRevealConfirming ? 'Revealing...' : expired ? 'Expired' : 'Reveal Roll'}
              </button>
              {expired && (
                <p className="text-xs text-red-400">
                  The reveal window has expired. Your roll was forfeited.
                </p>
              )}
            </div>
          ) : (
            <>
              {timeUntilNextRollNum > 0 ? (
                <div className="text-sm text-zinc-400">
                  Next roll in: <span className="text-zinc-200">{formatTime(timeUntilNextRoll as bigint | undefined)}</span>
                </div>
              ) : (
                <button
                  onClick={handleRoll}
                  disabled={isCommitting || isCommitConfirming || !canRoll}
                  className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {isCommitting ? 'Confirming...' : isCommitConfirming ? 'Rolling...' : `Roll (${formatEther(rollCost as bigint ?? ZERO)} ETH)`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {isOwner && isFrozen && prizeValue > ZERO && !hasClaimed && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="text-sm text-emerald-400">
            You won {formatEther(prizeValue)} ETH!
          </div>
          <button
            onClick={() => claim()}
            disabled={isClaiming || isClaimConfirming}
            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {isClaiming ? 'Confirming...' : isClaimConfirming ? 'Claiming...' : 'Claim Prize'}
          </button>
        </div>
      )}

      {hasClaimed && (
        <div className="text-sm text-zinc-400 text-center">
          Prize claimed ✓
        </div>
      )}
      
      {isOwner && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            {showAdvanced ? '▾ Hide advanced' : '▸ Advanced options'}
          </button>

          {showAdvanced && (
            <>
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-zinc-400">Profile Picture</h3>
                {hasPfp ? (
                  <button
                    onClick={() => clearPfp()}
                    disabled={isClearing || isClearConfirming}
                    className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition disabled:opacity-50"
                  >
                    {isClearing || isClearConfirming ? 'Clearing...' : 'Clear PFP'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowPfpForm(!showPfpForm)}
                    className="text-xs px-2 py-1 bg-violet-500/20 text-violet-400 rounded hover:bg-violet-500/30 transition"
                  >
                    {showPfpForm ? 'Cancel' : 'Equip PFP'}
                  </button>
                )}
              </div>

              {hasPfp && (
                <div className="text-xs text-zinc-500">
                  <div className="truncate">NFT: {pfpNft}</div>
                  <div>Token ID: {pfpTokenIdValue.toString()}</div>
                </div>
              )}

              {showPfpForm && !hasPfp && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="NFT Contract Address (0x...)"
                    value={pfpContract}
                    onChange={(e) => setPfpContract(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                  <input
                    type="text"
                    placeholder="Token ID"
                    value={pfpTokenId}
                    onChange={(e) => setPfpTokenId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={handleEquipPfp}
                    disabled={isEquipping || isEquipConfirming || !pfpContract || !pfpTokenId}
                    className="w-full px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold rounded transition disabled:opacity-50"
                  >
                    {isEquipping ? 'Confirming...' : isEquipConfirming ? 'Equipping...' : 'Equip NFT as PFP'}
                  </button>
                  <p className="text-xs text-zinc-500">
                    You must own both the Imp and the NFT to equip it as your profile picture.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
