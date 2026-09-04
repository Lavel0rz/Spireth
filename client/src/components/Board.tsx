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

export function Board({
  selectedImpId,
  onSelectImp,
}: {
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
}) {
  useSpirethEvents()
  const { data: totalMinted } = useTotalMinted()
  const [imps, setImps] = useState<ImpData[]>([])
  const [canvasMetrics, setCanvasMetrics] = useState<GameCanvasDisplayMetrics | null>(null)

  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  useEffect(() => {
    let cancelled = false

    if (total === 0) {
      const timer = window.setTimeout(() => {
        if (!cancelled) setImps([])
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
      if (!cancelled) setImps(validImps)
    }

    fetchImps()
    const interval = setInterval(fetchImps, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [total])

  const livingCount = useMemo(() => imps.filter((i) => !i.isDead).length, [imps])
  const deadCount = imps.length - livingCount

  const handleDisplayMetrics = useCallback((metrics: GameCanvasDisplayMetrics) => {
    setCanvasMetrics(metrics)
  }, [])

  const summitPct = rhombusYFraction(RHOMBUS_SUMMIT_Y) * 100
  const abyssPct = rhombusYFraction(RHOMBUS_ABYSS_Y) * 100
  const meterHeight = canvasMetrics?.displayHeight ?? undefined

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        <span className="text-2xl">⬥</span>
        The Spireth
        {imps.length > 0 && (
          <span className="text-xs font-normal text-zinc-500 ml-auto">
            {livingCount} living · {deadCount} fallen
          </span>
        )}
      </h2>

      <div className="flex gap-1">
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

        <div className="flex-1 min-w-0">
          <GameCanvas
            imps={imps}
            selectedImpId={selectedImpId}
            onSelectImp={onSelectImp}
            onDisplayMetrics={handleDisplayMetrics}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-zinc-500">
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
          <span className="text-zinc-400">Click a Pepe to select · scroll to zoom · drag to pan</span>
        </div>
      </div>
    </div>
  )
}
