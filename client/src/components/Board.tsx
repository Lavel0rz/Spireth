'use client'

import { useTotalMinted, useBillboard } from '@/hooks/useSpireth'
import { useSpirethEvents } from '@/hooks/useSpirethEvents'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { GameCanvas, type GameCanvasDisplayMetrics } from '@/components/GameCanvas'
import {
  FLOOR_MAX,
  FLOOR_MIN,
  RHOMBUS_ABYSS_Y,
  RHOMBUS_SUMMIT_Y,
  rhombusYFraction,
  type ImpData,
} from '@/lib/gameUtils'
import { useIsDevPlaytest, type SimStats as SimStatsType, type SimSummary } from '@/hooks/useSimulateCompetition'
import { SimStats } from '@/components/SimStats'
import { SimSummaryModal } from '@/components/SimSummaryModal'

export interface BillboardData {
  url: string
  label: string
  bid: bigint
  bidder: string
}

export interface BoardSimulationProps {
  simActive: boolean
  simVisible: boolean
  simImps: ImpData[]
  simStats: SimStatsType
  simSummary: SimSummary | null
  toggleSimulation: () => void
  dismissSummary: () => void
  runAgain: () => void
}

export function Board({
  selectedImpId,
  onSelectImp,
  simulation,
}: {
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
  simulation?: BoardSimulationProps
}) {
  useSpirethEvents()
  const { data: totalMinted } = useTotalMinted()
  const { data: billboardData } = useBillboard()
  const [realImps, setRealImps] = useState<ImpData[]>([])
  const [canvasMetrics, setCanvasMetrics] = useState<GameCanvasDisplayMetrics | null>(null)
  
  const billboard: BillboardData | null = useMemo(() => {
    if (!billboardData) return null
    const [url, label, bid, bidder] = billboardData as [string, string, bigint, string]
    if (!url || url.length === 0) return null
    return { url, label, bid, bidder }
  }, [billboardData])
  const isDevPlaytest = useIsDevPlaytest()
  
  const simActive = simulation?.simActive ?? false
  const simVisible = simulation?.simVisible ?? false
  const simImps = simulation?.simImps ?? []
  const simStats = simulation?.simStats ?? { rolls: 0, prizePoolUsd: 0, devPayoutUsd: 0, livingCount: 0, deadCount: 0, waves: 0 }
  const simSummary = simulation?.simSummary ?? null
  const toggleSimulation = simulation?.toggleSimulation ?? (() => {})
  const dismissSummary = simulation?.dismissSummary ?? (() => {})
  const runAgain = simulation?.runAgain ?? (() => {})

  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  useEffect(() => {
    if (simVisible) return

    let cancelled = false

    if (total === 0) {
      const timer = window.setTimeout(() => {
        if (!cancelled) setRealImps([])
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    const fetchImps = async () => {
      const impPromises = Array.from({ length: total }, (_, i) =>
        fetch(`/api/imp/${i}`)
          .then((r) => r.json())
          .catch(() => null),
      )
      const results = await Promise.all(impPromises)
      const validImps = results.filter(Boolean).map((imp, i) => ({
        id: BigInt(i),
        height: imp.height,
        isDead: imp.isDead,
        owner: imp.owner,
      }))
      if (!cancelled) setRealImps(validImps)
    }

    fetchImps()
    const interval = setInterval(fetchImps, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [total, simVisible])

  const imps = simVisible ? simImps : realImps
  const livingCount = useMemo(() => imps.filter((i) => !i.isDead).length, [imps])
  const deadCount = imps.length - livingCount

  const handleDisplayMetrics = useCallback((metrics: GameCanvasDisplayMetrics) => {
    setCanvasMetrics(metrics)
  }, [])

  const summitPct = rhombusYFraction(RHOMBUS_SUMMIT_Y) * 100
  const abyssPct = rhombusYFraction(RHOMBUS_ABYSS_Y) * 100
  const meterHeight = canvasMetrics?.displayHeight ?? undefined

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-3 flex flex-col flex-1 min-h-0 h-full">
      <div className="mb-2 flex items-center gap-3 flex-wrap shrink-0">
        <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <span className="text-lg">⬥</span>
          The Spireth
        </h2>
        <p className="text-xs text-zinc-500">Climb the Ethereum Rhombus</p>
        {imps.length > 0 && (
          <span className="text-xs text-zinc-500 ml-auto">
            {livingCount} living · {deadCount} fallen
            {simVisible ? (simActive ? ' · sim' : ' · sim ended') : ''}
          </span>
        )}
        {isDevPlaytest && simulation && (
          <div className="flex items-center gap-2 flex-wrap">
            {simVisible && <SimStats stats={simStats} />}
            <button
              type="button"
              onClick={toggleSimulation}
              disabled={simVisible && !simActive}
              className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                simActive
                  ? 'border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40'
                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300'
              }`}
            >
              {simActive ? 'Stop simulation' : simSummary ? 'Simulation ended' : 'Simulate competition'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 flex-1 min-h-0">
        <div
          className="relative shrink-0 w-6"
          style={{ height: meterHeight }}
          aria-hidden
        >
          <div
            className="absolute left-3 w-px -translate-x-1/2 bg-gradient-to-b from-emerald-500 via-zinc-700 to-red-500 pointer-events-none z-10"
            style={{
              top: `${summitPct}%`,
              height: `${abyssPct - summitPct}%`,
            }}
          />
          <div
            className="absolute left-3 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-emerald-500 pointer-events-none z-10"
            style={{ top: `${summitPct}%` }}
            title={`Summit +${FLOOR_MAX}`}
          />
          <div
            className="absolute left-3 w-3 h-3 -translate-x-1/2 translate-y-1/2 rotate-45 bg-red-500 pointer-events-none z-10"
            style={{ top: `${abyssPct}%` }}
            title={`Abyss ${FLOOR_MIN}`}
          />
        </div>

        <div className="flex-1 min-w-0 min-h-0 relative rounded-lg bg-zinc-950/40 overflow-hidden">
          <GameCanvas
            imps={imps}
            selectedImpId={selectedImpId}
            onSelectImp={onSelectImp}
            onDisplayMetrics={handleDisplayMetrics}
            billboard={billboard}
            denseRender={simVisible}
          />
          {simSummary && (
            <SimSummaryModal
              summary={simSummary}
              onDismiss={dismissSummary}
              onRunAgain={runAgain}
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#b8e0b0] border border-zinc-600" style={{ imageRendering: 'pixelated' }} />
          <span>Living</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-zinc-600 border border-zinc-500 opacity-60" />
          <span>Dead</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-violet-400 bg-transparent" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-400">Click a Pepe to select</span>
        </div>
      </div>
    </div>
  )
}
