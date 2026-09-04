'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { useGameAnimation } from '@/context/GameAnimationContext'
import { FLOOR_MAX, FLOOR_MIN, jumpDurationMs, type ImpData } from '@/lib/gameUtils'

const FOUNDRY_CHAIN_ID = 31337
const SIM_IMP_COUNT = 100
const SIM_TICK_MS = 2000
const SIM_FIRST_TICK_MS = 1000
const SIM_JUMP_STAGGER_MAX_MS = 300

export const ROLL_USD = 5
export const POOL_SHARE_USD = 4
export const DEV_SHARE_USD = 1
export const BELL_BONUS_PCT = 20

export type SimOutcome = 'summit' | 'abyss'

export interface SimSummary {
  winnerId: bigint
  outcome: SimOutcome
  finalHeight: number
  totalRolls: number
  totalSpentUsd: number
  prizePoolUsd: number
  devPayoutUsd: number
  bellBonusUsd: number
  remainingPoolUsd: number
  waves: number
  durationMs: number
  livingAtEnd: number
}

export interface SimStats {
  rolls: number
  prizePoolUsd: number
  devPayoutUsd: number
  livingCount: number
  waves: number
}

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

function buildSummary(
  winnerId: bigint,
  outcome: SimOutcome,
  finalHeight: number,
  rolls: number,
  poolUsd: number,
  devUsd: number,
  waves: number,
  startedAt: number,
  livingAtEnd: number,
): SimSummary {
  const bellBonusUsd = Math.round(poolUsd * (BELL_BONUS_PCT / 100))
  const remainingPoolUsd = poolUsd - bellBonusUsd

  return {
    winnerId,
    outcome,
    finalHeight,
    totalRolls: rolls,
    totalSpentUsd: rolls * ROLL_USD,
    prizePoolUsd: poolUsd,
    devPayoutUsd: devUsd,
    bellBonusUsd,
    remainingPoolUsd,
    waves,
    durationMs: Date.now() - startedAt,
    livingAtEnd,
  }
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
  const [summary, setSummary] = useState<SimSummary | null>(null)
  const [stats, setStats] = useState<SimStats>({
    rolls: 0,
    prizePoolUsd: 0,
    devPayoutUsd: 0,
    livingCount: SIM_IMP_COUNT,
    waves: 0,
  })

  const heightsRef = useRef<Map<string, number>>(new Map())
  const impsRef = useRef<ImpData[]>([])
  const pendingTimeoutsRef = useRef<number[]>([])
  const jumpEndTimesRef = useRef<Map<string, number>>(new Map())
  const rollsRef = useRef(0)
  const poolUsdRef = useRef(0)
  const devUsdRef = useRef(0)
  const wavesRef = useRef(0)
  const startedAtRef = useRef(0)
  const endedRef = useRef(false)
  const tickIntervalRef = useRef<number | null>(null)

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

  const syncStats = useCallback((livingCount: number) => {
    setStats({
      rolls: rollsRef.current,
      prizePoolUsd: poolUsdRef.current,
      devPayoutUsd: devUsdRef.current,
      livingCount,
      waves: wavesRef.current,
    })
  }, [])

  const finishCompetition = useCallback(
    (winnerId: bigint, outcome: SimOutcome, finalHeight: number) => {
      if (endedRef.current) return
      endedRef.current = true

      if (tickIntervalRef.current !== null) {
        window.clearInterval(tickIntervalRef.current)
        tickIntervalRef.current = null
      }

      setActive(false)

      const livingAtEnd = impsRef.current.filter((imp) => !imp.isDead).length
      setSummary(
        buildSummary(
          winnerId,
          outcome,
          finalHeight,
          rollsRef.current,
          poolUsdRef.current,
          devUsdRef.current,
          wavesRef.current,
          startedAtRef.current,
          livingAtEnd,
        ),
      )
    },
    [],
  )

  const recordRollEconomics = useCallback(() => {
    rollsRef.current += 1
    poolUsdRef.current += POOL_SHARE_USD
    devUsdRef.current += DEV_SHARE_USD
  }, [])

  const scheduleRollForImp = useCallback(
    (imp: ImpData) => {
      const key = imp.id.toString()
      const now = Date.now()
      const jumpEnd = jumpEndTimesRef.current.get(key) ?? 0
      const waitForJump = Math.max(0, jumpEnd - now)
      const staggerMs = randomInt(0, SIM_JUMP_STAGGER_MAX_MS)
      const delay = waitForJump + staggerMs

      scheduleTimeout(() => {
        if (endedRef.current) return

        const living = impsRef.current.find((entry) => entry.id === imp.id)
        if (!living || living.isDead) return

        const currentHeight = heightsRef.current.get(key) ?? living.height
        const dice = randomInt(1, 4) * (Math.random() < 0.5 ? -1 : 1)
        const newHeight = clampFloor(currentHeight + dice)

        heightsRef.current.set(key, newHeight)
        recordRollEconomics()

        const jumpMs = jumpDurationMs(currentHeight, newHeight)
        const revealAt = Date.now()
        jumpEndTimesRef.current.set(key, revealAt + jumpMs)

        triggerReveal(imp.id, dice, newHeight)

        const livingCount = impsRef.current.filter((entry) => !entry.isDead).length
        syncStats(livingCount)

        scheduleTimeout(() => {
          if (endedRef.current) return

          setSimImps((prev) =>
            prev.map((entry) =>
              entry.id === imp.id ? { ...entry, height: newHeight } : entry,
            ),
          )

          if (newHeight === FLOOR_MAX || newHeight === FLOOR_MIN) {
            finishCompetition(
              imp.id,
              newHeight === FLOOR_MAX ? 'summit' : 'abyss',
              newHeight,
            )
          }
        }, jumpMs)
      }, delay)
    },
    [finishCompetition, recordRollEconomics, scheduleTimeout, syncStats, triggerReveal],
  )

  const resetState = useCallback(() => {
    clearPendingTimeouts()
    if (tickIntervalRef.current !== null) {
      window.clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
    heightsRef.current.clear()
    jumpEndTimesRef.current.clear()
    rollsRef.current = 0
    poolUsdRef.current = 0
    devUsdRef.current = 0
    wavesRef.current = 0
    endedRef.current = false
    startedAtRef.current = 0
    setSummary(null)
    setStats({
      rolls: 0,
      prizePoolUsd: 0,
      devPayoutUsd: 0,
      livingCount: SIM_IMP_COUNT,
      waves: 0,
    })
  }, [clearPendingTimeouts])

  const start = useCallback(() => {
    resetState()
    const imps = generateSimImps()
    heightsRef.current = new Map(imps.map((imp) => [imp.id.toString(), imp.height]))
    impsRef.current = imps
    startedAtRef.current = Date.now()
    setSimImps(imps)
    setActive(true)
    syncStats(imps.length)
  }, [resetState, syncStats])

  const stop = useCallback(() => {
    resetState()
    setActive(false)
    setSimImps([])
  }, [resetState])

  const dismissSummary = useCallback(() => {
    setSummary(null)
    setSimImps([])
  }, [])

  const runAgain = useCallback(() => {
    start()
  }, [start])

  const toggle = useCallback(() => {
    if (active) stop()
    else start()
  }, [active, start, stop])

  useEffect(() => {
    if (!active) return

    const tick = () => {
      if (endedRef.current) return

      const living = impsRef.current.filter((imp) => !imp.isDead)
      if (living.length === 0) return

      wavesRef.current += 1

      for (const imp of living) {
        scheduleRollForImp(imp)
      }

      syncStats(living.length)
    }

    const firstTickId = window.setTimeout(() => {
      tick()
      tickIntervalRef.current = window.setInterval(tick, SIM_TICK_MS)
    }, SIM_FIRST_TICK_MS)

    pendingTimeoutsRef.current.push(firstTickId)

    return () => {
      clearPendingTimeouts()
      if (tickIntervalRef.current !== null) {
        window.clearInterval(tickIntervalRef.current)
        tickIntervalRef.current = null
      }
    }
  }, [active, clearPendingTimeouts, scheduleRollForImp, syncStats])

  const simVisible = active || simImps.length > 0

  return {
    active,
    simVisible,
    simImps,
    stats,
    summary,
    start,
    stop,
    toggle,
    dismissSummary,
    runAgain,
  }
}
