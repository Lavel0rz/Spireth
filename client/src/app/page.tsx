'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { WalletConnect } from '@/components/WalletConnect'
import { SeasonInfo } from '@/components/SeasonInfo'
import { Leaderboard } from '@/components/Leaderboard'
import { Board } from '@/components/Board'
import { ImpPanel } from '@/components/ImpPanel'
import { RuleChips } from '@/components/RuleChips'
import { useHasMinted, useOwnedImpId } from '@/hooks/useSpireth'

export default function Home() {
  const { address } = useAccount()
  const { data: hasMinted } = useHasMinted(address)
  const { impId: ownedImpId } = useOwnedImpId(address)
  const [selectedImpId, setSelectedImpId] = useState<bigint | null>(null)

  useEffect(() => {
    if (hasMinted === true && ownedImpId !== null) {
      setSelectedImpId(ownedImpId)
    }
  }, [hasMinted, ownedImpId])

  return (
    <div className="min-h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-zinc-900 to-zinc-950 -z-10" />
      
      <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[90rem] mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rotate-45 rounded-sm" />
              <div className="absolute inset-0 w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-500 rotate-45 rounded-sm opacity-50 blur-sm" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">The Spireth</h1>
              <p className="text-xs text-zinc-500">Season 1</p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="max-w-[90rem] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9">
            <Board
              selectedImpId={selectedImpId}
              onSelectImp={setSelectedImpId}
            />
          </div>

          <div className="lg:col-span-3 space-y-4">
            <SeasonInfo />
            <RuleChips />
            <Leaderboard
              selectedImpId={selectedImpId}
              onSelectImp={setSelectedImpId}
            />
            <ImpPanel impId={selectedImpId} />
            
            <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Quick Rules</h3>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li className="flex gap-2">
                  <span className="text-emerald-400">◈</span>
                  <span>Free join during signup or live season</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400">◈</span>
                  <span>Roll cost: ~$5 (80% to pool)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-violet-400">◈</span>
                  <span>Miss 72h = death (ineligible)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400">◈</span>
                  <span>Bell ringer gets 20% bonus</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-400">◈</span>
                  <span>Season max: 45 days</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800/50 mt-8">
        <div className="max-w-[90rem] mx-auto px-4 py-6 text-center text-sm text-zinc-500">
          <p>The Spireth · Season 1 · Built on Base</p>
        </div>
      </footer>
    </div>
  )
}
