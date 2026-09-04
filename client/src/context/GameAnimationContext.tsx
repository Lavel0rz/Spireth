'use client'

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

export type GameAnimEvent =
  | { type: 'commit'; impId: bigint }
  | { type: 'revealPending'; impId: bigint }
  | { type: 'reveal'; impId: bigint; dice: number; newHeight: number }

type Listener = (event: GameAnimEvent) => void

interface GameAnimationContextValue {
  triggerCommit: (impId: bigint) => void
  triggerRevealPending: (impId: bigint) => void
  triggerReveal: (impId: bigint, dice: number, newHeight: number) => void
  subscribe: (listener: Listener) => () => void
}

const GameAnimationContext = createContext<GameAnimationContextValue | null>(null)

export function GameAnimationProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>())

  const emit = useCallback((event: GameAnimEvent) => {
    listeners.current.forEach((listener) => listener(event))
  }, [])

  const triggerCommit = useCallback(
    (impId: bigint) => emit({ type: 'commit', impId }),
    [emit],
  )

  const triggerRevealPending = useCallback(
    (impId: bigint) => emit({ type: 'revealPending', impId }),
    [emit],
  )

  const triggerReveal = useCallback(
    (impId: bigint, dice: number, newHeight: number) =>
      emit({ type: 'reveal', impId, dice, newHeight }),
    [emit],
  )

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  return (
    <GameAnimationContext.Provider
      value={{ triggerCommit, triggerRevealPending, triggerReveal, subscribe }}
    >
      {children}
    </GameAnimationContext.Provider>
  )
}

export function useGameAnimation() {
  const ctx = useContext(GameAnimationContext)
  if (!ctx) {
    throw new Error('useGameAnimation must be used within GameAnimationProvider')
  }
  return ctx
}
