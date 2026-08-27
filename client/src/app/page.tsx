'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { WalletConnect } from '@/components/WalletConnect'
import { SeasonInfo } from '@/components/SeasonInfo'
import { Board } from '@/components/Board'
import { ImpPanel } from '@/components/ImpPanel'
import { useHasMinted, useTotalMinted } from '@/hooks/useSpireth'

export default function Home() {
  const { address } = useAccount()
  const { data: hasMinted } = useHasMinted(address)
  const { data: totalMinted } = useTotalMinted()
  const [selectedImpId, setSelectedImpId] = useState<bigint | null>(null)

  useEffect(() => {
    if (hasMinted && address && totalMinted !== undefined) {
      const checkOwnership = async () => {
        for (let i = 0; i < Number(totalMinted); i++) {
          try {
            const res = await fetch(`/api/imp/${i}`)
            const data = await res.json()
            if (data.owner?.toLowerCase() === address.toLowerCase()) {
              setSelectedImpId(BigInt(i))
              break
            }
          } catch (e) {
            console.error('Error checking imp ownership:', e)
          }
        }
      }
      checkOwnership()
    }
  }, [hasMinted, address, totalMinted])

  return (
    <div className="min-h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-zinc-900 to-zinc-950 -z-10" />
      
      <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-violet-900/20 border border-zinc-800 rounded-2xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  Climb the Ethereum Rhombus
                </h2>
                <p className="text-zinc-400 max-w-xl mx-auto">
                  Roll the dice daily to move your Imp up or down. First to reach +36 (Summit) or -36 (Abyss) 
                  rings the bell and freezes the season. Top 50% of living Imps split the prize pool.
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-2xl mb-1">🎲</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Dice</div>
                  <div className="text-sm font-medium">±1 to ±4</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-2xl mb-1">⏰</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Roll</div>
                  <div className="text-sm font-medium">Once/24h</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-2xl mb-1">💀</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Death</div>
                  <div className="text-sm font-medium">72h idle</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="text-2xl mb-1">🏆</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Bell</div>
                  <div className="text-sm font-medium">+20% bonus</div>
                </div>
              </div>
            </div>

            <Board 
              selectedImpId={selectedImpId} 
              onSelectImp={setSelectedImpId}
              userImpId={hasMinted ? selectedImpId ?? undefined : undefined}
            />
          </div>

          <div className="space-y-6">
            <SeasonInfo />
            <ImpPanel impId={selectedImpId} />
            
            <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Quick Rules</h3>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li className="flex gap-2">
                  <span className="text-emerald-400">◈</span>
                  <span>Free mint during 72h signup</span>
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

      <footer className="border-t border-zinc-800/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-zinc-500">
          <p>The Spireth · Season 1 · Built on Base</p>
        </div>
      </footer>
    </div>
  )
}
