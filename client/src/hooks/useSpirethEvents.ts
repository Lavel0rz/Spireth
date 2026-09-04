'use client'

import { useWatchContractEvent } from 'wagmi'
import type { Log } from 'viem'
import TheSpirethABI from '@/abi/TheSpireth.json'
import { useContractAddress } from '@/hooks/useSpireth'
import { useGameAnimation } from '@/context/GameAnimationContext'

type RollCommittedLog = Log & { args: { impId: bigint } }
type RollRevealedLog = Log & { args: { impId: bigint; dice: number; newHeight: number } }

export function useSpirethEvents() {
  const address = useContractAddress()
  const { triggerCommit, triggerReveal } = useGameAnimation()

  useWatchContractEvent({
    address,
    abi: TheSpirethABI,
    eventName: 'RollCommitted',
    onLogs(logs) {
      for (const log of logs as RollCommittedLog[]) {
        if (log.args?.impId !== undefined) triggerCommit(log.args.impId)
      }
    },
  })

  useWatchContractEvent({
    address,
    abi: TheSpirethABI,
    eventName: 'RollRevealed',
    onLogs(logs) {
      for (const log of logs as RollRevealedLog[]) {
        const { impId, dice, newHeight } = log.args ?? {}
        if (impId !== undefined && dice !== undefined && newHeight !== undefined) {
          triggerReveal(impId, Number(dice), Number(newHeight))
        }
      }
    },
  })
}
