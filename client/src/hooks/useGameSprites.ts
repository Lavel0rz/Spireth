'use client'

import { useEffect, useState } from 'react'

export interface GameSprites {
  walk: HTMLImageElement
  actions: HTMLImageElement
  grass: HTMLImageElement
  hills: HTMLImageElement
  stone: HTMLImageElement
  water: HTMLImageElement
}

const SPRITE_PATHS = {
  walk: '/game/characters/Basic-Character-Spritesheet.png',
  actions: '/game/characters/Basic-Character-Actions.png',
  grass: '/game/tiles/Grass_Tile.png',
  hills: '/game/tiles/Dark_Grass_Hill_Tiles.png',
  stone: '/game/tiles/Stone_Ground_Tiles.png',
  water: '/game/tiles/Water.png',
} as const

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
      load(SPRITE_PATHS.walk),
      load(SPRITE_PATHS.actions),
      load(SPRITE_PATHS.grass),
      load(SPRITE_PATHS.hills),
      load(SPRITE_PATHS.stone),
      load(SPRITE_PATHS.water),
    ])
      .then(([walk, actions, grass, hills, stone, water]) => {
        if (!cancelled) setSprites({ walk, actions, grass, hills, stone, water })
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
