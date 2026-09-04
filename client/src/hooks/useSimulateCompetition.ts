'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { useGameAnimation } from '@/context/GameAnimationContext'
import { FLOOR_MAX, FLOOR_MIN, jumpDurationMs, type ImpData } from '@/lib/gameUtils'

const FOUNDRY_CHAIN_ID = 31337
const SIM_IMP_COUNT = 100
const SIM_TICK_MS = 5000
const SIM_BATCH_SIZE = 30
const SIM_FIRST_TICK_MS = 1000
const SIM_JUMP_STAGGER_MAX_MS = 400

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function randomAddress(): string {
  return `0x${randomHex(40)}`
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function clampFloor(height: number): number {
  return Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, height))
}

function generateUniqueOwners(count: number): string[] {
  const owners = new Set<string>()
  while (owners.size < count) {
    owners.add(randomAddress())
  }
  return [...owners]
}

function generateSimImps(): ImpData[] {
  const owners = generateUniqueOwners(SIM_IMP_COUNT)
  return Array.from({ length: SIM_IMP_COUNT }, (_, i) => ({
    id: BigInt(i),
    height: 0,
    isDead: false,
    owner: owners[i],
  }))
}

export function useIsDevPlaytest(): boolean {
  const chainId = useChainId()
  const [isLocalHost, setIsLocalHost] = useState(false)

  useEffect(() => {
    const host = window.location.hostname
    setIsLocalHost(host === 'localhost' || host === '127.0.0.1')
  }, [])

  return chainId === FOUNDRY_CHAIN_ID || isLocalHost
}

export function useSimulateCompetition() {
  const { triggerReveal } = useGameAnimation()
  const [active, setActive] = useState(false)
  const [simImps, setSimImps] = useState<ImpData[]>([])
  const heightsRef = useRef<Map<string, number>>(new Map())
  const impsRef = useRef<ImpData[]>([])
  const pendingTimeoutsRef = useRef<number[]>([])

  useEffect(() => {
    impsRef.current = simImps
  }, [simImps])

  const clearPendingTimeouts = useCallback(() => {
    for (const id of pendingTimeoutsRef.current) {
      window.clearTimeout(id)
    }
    pendingTimeoutsRef.current = []
  }, [])

  const scheduleTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay)
    pendingTimeoutsRef.current.push(id)
    return id
  }, [])

  const start = useCallback(() => {
    clearPendingTimeouts()
    const imps = generateSimImps()
    heightsRef.current = new Map(imps.map((imp) => [imp.id.toString(), imp.height]))
    setSimImps(imps)
    setActive(true)
  }, [clearPendingTimeouts])

  const stop = useCallback(() => {
    setActive(false)
    setSimImps([])
    heightsRef.current.clear()
    clearPendingTimeouts()
  }, [clearPendingTimeouts])

  const toggle = useCallback(() => {
    if (active) stop()
    else start()
  }, [active, start, stop])

  useEffect(() => {
    if (!active) return

    const tick = () => {
      const living = impsRef.current.filter((imp) => !imp.isDead)
      if (living.length === 0) return

      const batchCount = Math.min(SIM_BATCH_SIZE, living.length)
      const picked = new Set<number>()
      while (picked.size < batchCount) {
        picked.add(randomInt(0, living.length - 1))
      }

      for (const index of picked) {
        const imp = living[index]
        const key = imp.id.toString()
        const currentHeight = heightsRef.current.get(key) ?? imp.height
        const dice = randomInt(1, 4) * (Math.random() < 0.5 ? -1 : 1)
        const newHeight = clampFloor(currentHeight + dice)

        heightsRef.current.set(key, newHeight)

        const staggerMs = randomInt(0, SIM_JUMP_STAGGER_MAX_MS)
        const jumpMs = jumpDurationMs(currentHeight, newHeight)

        scheduleTimeout(() => {
          triggerReveal(imp.id, dice, newHeight)
        }, staggerMs)

        scheduleTimeout(() => {
          setSimImps((prev) =>
            prev.map((entry) =>
              entry.id === imp.id ? { ...entry, height: newHeight } : entry,
            ),
          )
        }, staggerMs + jumpMs)
      }
    }

    const scheduleNext = (delay: number) => {
      const id = window.setTimeout(() => {
        tick()
        scheduleNext(SIM_TICK_MS)
      }, delay)
      pendingTimeoutsRef.current.push(id)
    }

    scheduleNext(SIM_FIRST_TICK_MS)

    return () => {
      clearPendingTimeouts()
    }
  }, [active, clearPendingTimeouts, scheduleTimeout, triggerReveal])

  return {
    active,
    simImps,
    start,
    stop,
    toggle,
  }
}
