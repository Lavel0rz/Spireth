'use client'

import { useTotalMinted } from '@/hooks/useSpireth'
import { useSpirethEvents } from '@/hooks/useSpirethEvents'
import { useState, useEffect, useMemo } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import type { ImpData } from '@/lib/gameUtils'

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

      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500 via-zinc-700 to-red-500 pointer-events-none z-10" />
        <div
          className="absolute left-2 top-0 w-3 h-3 rotate-45 bg-emerald-500 pointer-events-none z-10"
          title="Summit +25"
        />
        <div
          className="absolute left-2 bottom-0 w-3 h-3 rotate-45 bg-red-500 pointer-events-none z-10"
          title="Abyss -25"
        />

        <GameCanvas
          imps={imps}
          selectedImpId={selectedImpId}
          onSelectImp={onSelectImp}
        />
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
          <span className="text-zinc-400">Click a character to select</span>
        </div>
      </div>
    </div>
  )
}
