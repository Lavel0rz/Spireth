'use client'

import { useEffect, useState } from 'react'

export interface GameSprites {
  pepe: HTMLImageElement
  grass: HTMLImageElement
  hills: HTMLImageElement
  stone: HTMLImageElement
  water: HTMLImageElement
}

const SPRITE_PATHS = {
  pepe: '/game/characters/pepe.png',
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
      load(SPRITE_PATHS.pepe),
      load(SPRITE_PATHS.grass),
      load(SPRITE_PATHS.hills),
      load(SPRITE_PATHS.stone),
      load(SPRITE_PATHS.water),
    ])
      .then(([pepe, grass, hills, stone, water]) => {
        if (!cancelled) setSprites({ pepe, grass, hills, stone, water })
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
