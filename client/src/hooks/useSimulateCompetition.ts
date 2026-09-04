'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { useGameAnimation } from '@/context/GameAnimationContext'
import { FLOOR_MAX, FLOOR_MIN, jumpDurationMs, type ImpData } from '@/lib/gameUtils'

const FOUNDRY_CHAIN_ID = 31337
const SIM_IMP_COUNT = 100

const ROLL_USD = 5
const POOL_SHARE_USD = 4
const DEV_SHARE_USD = 1
const BELL_BONUS_PCT = 0.2

export interface Top10Entry {
  id: bigint
  height: number
  spentUsd: number
  payoutUsd: number
  netUsd: number
  isWinner: boolean
}

export interface SimSummary {
  totalRolls: number
  prizePoolUsd: number
  bellBonusUsd: number
  remainingPoolUsd: number
  winnerId: bigint
  winnerHeight: number
  livingAtEnd: number
  top10: Top10Entry[]
}
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

function buildSummary(
  imps: ImpData[],
  rollCounts: Map<string, number>,
  winnerId: bigint,
): SimSummary {
  const totalRolls = Array.from(rollCounts.values()).reduce((a, b) => a + b, 0)
  const prizePoolUsd = totalRolls * POOL_SHARE_USD
  const bellBonusUsd = prizePoolUsd * BELL_BONUS_PCT
  const remainingPoolUsd = prizePoolUsd - bellBonusUsd

  const living = imps.filter((imp) => !imp.isDead)
  const livingAtEnd = living.length
  const sharePerLiving = livingAtEnd > 0 ? remainingPoolUsd / livingAtEnd : 0

  const winner = imps.find((imp) => imp.id === winnerId)
  const winnerHeight = winner?.height ?? 0

  const entries: Top10Entry[] = imps.map((imp) => {
    const rolls = rollCounts.get(imp.id.toString()) ?? 0
    const spentUsd = rolls * ROLL_USD
    const isWinner = imp.id === winnerId
    let payoutUsd = 0
    if (!imp.isDead) {
      payoutUsd = sharePerLiving
      if (isWinner) {
        payoutUsd += bellBonusUsd
      }
    }
    return {
      id: imp.id,
      height: imp.height,
      spentUsd,
      payoutUsd,
      netUsd: payoutUsd - spentUsd,
      isWinner,
    }
  })

  entries.sort((a, b) => {
    const absHeightDiff = Math.abs(b.height) - Math.abs(a.height)
    if (absHeightDiff !== 0) return absHeightDiff
    const payoutDiff = b.payoutUsd - a.payoutUsd
    if (payoutDiff !== 0) return payoutDiff
    return Number(a.id - b.id)
  })

  let top10 = entries.slice(0, 10)
  const winnerInTop10 = top10.some((e) => e.isWinner)
  if (!winnerInTop10) {
    const winnerEntry = entries.find((e) => e.isWinner)
    if (winnerEntry) {
      top10 = [winnerEntry, ...top10.slice(0, 9)]
    }
  }

  return {
    totalRolls,
    prizePoolUsd,
    bellBonusUsd,
    remainingPoolUsd,
    winnerId,
    winnerHeight,
    livingAtEnd,
    top10,
  }
}

export function useSimulateCompetition() {
  const { triggerReveal } = useGameAnimation()
  const [active, setActive] = useState(false)
  const [simImps, setSimImps] = useState<ImpData[]>([])
  const [summary, setSummary] = useState<SimSummary | null>(null)
  const heightsRef = useRef<Map<string, number>>(new Map())
  const impsRef = useRef<ImpData[]>([])
  const pendingTimeoutsRef = useRef<number[]>([])
  const rollCountsRef = useRef<Map<string, number>>(new Map())
  const finishedRef = useRef(false)

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

  const finishCompetition = useCallback(
    (winnerId: bigint) => {
      if (finishedRef.current) return
      finishedRef.current = true
      clearPendingTimeouts()
      setActive(false)

      const finalSummary = buildSummary(
        impsRef.current,
        rollCountsRef.current,
        winnerId,
      )
      setSummary(finalSummary)
    },
    [clearPendingTimeouts],
  )

  const dismissSummary = useCallback(() => {
    setSummary(null)
  }, [])

  const start = useCallback(() => {
    clearPendingTimeouts()
    const imps = generateSimImps()
    heightsRef.current = new Map(imps.map((imp) => [imp.id.toString(), imp.height]))
    rollCountsRef.current = new Map()
    finishedRef.current = false
    setSummary(null)
    setSimImps(imps)
    setActive(true)
  }, [clearPendingTimeouts])

  const stop = useCallback(() => {
    setActive(false)
    setSimImps([])
    heightsRef.current.clear()
    rollCountsRef.current.clear()
    finishedRef.current = false
    setSummary(null)
    clearPendingTimeouts()
  }, [clearPendingTimeouts])

  const toggle = useCallback(() => {
    if (active) stop()
    else start()
  }, [active, start, stop])

  useEffect(() => {
    if (!active) return

    const tick = () => {
      if (finishedRef.current) return

      const living = impsRef.current.filter((imp) => !imp.isDead)
      if (living.length === 0) return

      const batchCount = Math.min(SIM_BATCH_SIZE, living.length)
      const picked = new Set<number>()
      while (picked.size < batchCount) {
        picked.add(randomInt(0, living.length - 1))
      }

      for (const index of picked) {
        if (finishedRef.current) break

        const imp = living[index]
        const key = imp.id.toString()
        const currentHeight = heightsRef.current.get(key) ?? imp.height
        const dice = randomInt(1, 4) * (Math.random() < 0.5 ? -1 : 1)
        const newHeight = clampFloor(currentHeight + dice)

        heightsRef.current.set(key, newHeight)

        const prevCount = rollCountsRef.current.get(key) ?? 0
        rollCountsRef.current.set(key, prevCount + 1)

        const staggerMs = randomInt(0, SIM_JUMP_STAGGER_MAX_MS)
        const jumpMs = jumpDurationMs(currentHeight, newHeight)

        scheduleTimeout(() => {
          triggerReveal(imp.id, dice, newHeight)
        }, staggerMs)

        const isWinningMove = newHeight === FLOOR_MAX || newHeight === FLOOR_MIN

        scheduleTimeout(() => {
          setSimImps((prev) =>
            prev.map((entry) =>
              entry.id === imp.id ? { ...entry, height: newHeight } : entry,
            ),
          )

          if (isWinningMove) {
            finishCompetition(imp.id)
          }
        }, staggerMs + jumpMs)
      }
    }

    const scheduleNext = (delay: number) => {
      const id = window.setTimeout(() => {
        if (!finishedRef.current) {
          tick()
          scheduleNext(SIM_TICK_MS)
        }
      }, delay)
      pendingTimeoutsRef.current.push(id)
    }

    scheduleNext(SIM_FIRST_TICK_MS)

    return () => {
      clearPendingTimeouts()
    }
  }, [active, clearPendingTimeouts, scheduleTimeout, triggerReveal, finishCompetition])

  return {
    active,
    simImps,
    summary,
    start,
    stop,
    toggle,
    dismissSummary,
  }
}
