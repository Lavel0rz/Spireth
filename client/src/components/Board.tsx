'use client'

import { useTotalMinted } from '@/hooks/useSpireth'
import { useSpirethEvents } from '@/hooks/useSpirethEvents'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { GameCanvas, type GameCanvasDisplayMetrics } from '@/components/GameCanvas'
import {
  RHOMBUS_ABYSS_Y,
  RHOMBUS_SUMMIT_Y,
  rhombusYFraction,
  type ImpData,
} from '@/lib/gameUtils'
import { useIsDevPlaytest, useSimulateCompetition } from '@/hooks/useSimulateCompetition'
import { SimSummaryModal } from '@/components/SimSummaryModal'

export function Board({
  selectedImpId,
  onSelectImp,
}: {
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
}) {
  useSpirethEvents()
  const { data: totalMinted } = useTotalMinted()
  const [realImps, setRealImps] = useState<ImpData[]>([])
  const [canvasMetrics, setCanvasMetrics] = useState<GameCanvasDisplayMetrics | null>(null)
  const isDevPlaytest = useIsDevPlaytest()
  const { active: simActive, simImps, summary: simSummary, toggle: toggleSimulation, dismissSummary } = useSimulateCompetition()

  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  useEffect(() => {
    if (simActive) return

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
  }, [total, simActive])

  const imps = simActive ? simImps : realImps
  const livingCount = useMemo(() => imps.filter((i) => !i.isDead).length, [imps])
  const deadCount = imps.length - livingCount

  const handleDisplayMetrics = useCallback((metrics: GameCanvasDisplayMetrics) => {
    setCanvasMetrics(metrics)
  }, [])

  const summitPct = rhombusYFraction(RHOMBUS_SUMMIT_Y) * 100
  const abyssPct = rhombusYFraction(RHOMBUS_ABYSS_Y) * 100
  const meterHeight = canvasMetrics?.displayHeight ?? undefined

  return (
    <>
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
              {simActive ? ' · sim' : ''}
            </span>
          )}
          {isDevPlaytest && (
            <button
              type="button"
              onClick={toggleSimulation}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                simActive
                  ? 'border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40'
                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300'
              }`}
            >
              {simActive ? 'Stop simulation' : 'Simulate competition'}
            </button>
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
              title="Summit +25"
            />
            <div
              className="absolute left-3 w-3 h-3 -translate-x-1/2 translate-y-1/2 rotate-45 bg-red-500 pointer-events-none z-10"
              style={{ top: `${abyssPct}%` }}
              title="Abyss -25"
            />
          </div>

          <div className="flex-1 min-w-0 min-h-0 relative rounded-lg bg-zinc-950/40 overflow-hidden">
            <GameCanvas
              imps={imps}
              selectedImpId={selectedImpId}
              onSelectImp={onSelectImp}
              onDisplayMetrics={handleDisplayMetrics}
            />
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

      {simSummary && (
        <SimSummaryModal summary={simSummary} onClose={dismissSummary} />
      )}
    </>
  )
}
