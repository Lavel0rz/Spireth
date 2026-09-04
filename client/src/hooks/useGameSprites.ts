'use client'

import { useEffect, useState } from 'react'

export interface GameSprites {
  walk: HTMLImageElement
  actions: HTMLImageElement
  grass: HTMLImageElement
  hills: HTMLImageElement
}

export function useGameSprites() {
  const [sprites, setSprites] = useState<GameSprites | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load ${src}`))
        img.src = src
      })

    Promise.all([
      load('/game/character-walk.png'),
      load('/game/character-actions.png'),
      load('/game/grass.png'),
      load('/game/hills.png'),
    ])
      .then(([walk, actions, grass, hills]) => {
        if (!cancelled) setSprites({ walk, actions, grass, hills })
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { sprites, error, ready: sprites !== null }
}
