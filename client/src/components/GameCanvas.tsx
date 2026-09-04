'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameSprites } from '@/hooks/useGameSprites'
import { useGameAnimation } from '@/context/GameAnimationContext'
import {
  DIRECTION_ROW,
  FLOOR_MAX,
  FLOOR_MIN,
  SPRITE_SIZE,
  type Direction,
  type ImpData,
  floorWidth,
  shortAddress,
  tintFromAddress,
  yForLevel,
} from '@/lib/gameUtils'

const CANVAS_W = 440
const PADDING_TOP = 28
const FLOOR_GAP = 11
const MAX_PLATFORM_W = 360
const MIN_PLATFORM_W = 72
const SPRITE_SCALE = 2
const DISPLAY_SIZE = SPRITE_SIZE * SPRITE_SCALE
const CANVAS_H = PADDING_TOP + (FLOOR_MAX - FLOOR_MIN) * FLOOR_GAP + 40

type AnimState = 'walk' | 'commit' | 'revealPending' | 'jump' | 'dead'

interface CharacterEntity {
  impId: string
  owner: string
  height: number
  displayHeight: number
  floorX: number
  direction: 1 | -1
  facing: Direction
  animState: AnimState
  frame: number
  frameTimer: number
  animTimer: number
  jumpFrom: number
  jumpTo: number
  jumpProgress: number
  jumpSteps: number[]
  jumpStepIndex: number
  tint: [number, number, number]
  isDead: boolean
  isSelected: boolean
  yOffset: number
}

function drawTintedFrame(
  ctx: CanvasRenderingContext2D,
  offscreen: HTMLCanvasElement,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  size: number,
  tint: [number, number, number],
  greyscale = false,
) {
  const offCtx = offscreen.getContext('2d')
  if (!offCtx) return

  offCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  offCtx.drawImage(image, sx, sy, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE)

  const imgData = offCtx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  for (let i = 0; i < imgData.data.length; i += 4) {
    const a = imgData.data[i + 3]
    if (a === 0) continue
    const lum = imgData.data[i] * 0.3 + imgData.data[i + 1] * 0.59 + imgData.data[i + 2] * 0.11
    if (lum < 15) continue
    if (greyscale) {
      const g = lum * 0.55
      imgData.data[i] = g
      imgData.data[i + 1] = g
      imgData.data[i + 2] = g
    } else {
      const shade = Math.min(1.2, lum / 180)
      imgData.data[i] = Math.min(255, tint[0] * shade)
      imgData.data[i + 1] = Math.min(255, tint[1] * shade)
      imgData.data[i + 2] = Math.min(255, tint[2] * shade)
    }
  }
  offCtx.putImageData(imgData, 0, 0)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(offscreen, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, size, size)
}

function buildJumpSteps(from: number, to: number): number[] {
  const steps: number[] = []
  const dir = to > from ? 1 : -1
  for (let h = from + dir; dir > 0 ? h <= to : h >= to; h += dir) {
    steps.push(h)
  }
  return steps
}

export function GameCanvas({
  imps,
  selectedImpId,
  onSelectImp,
}: {
  imps: ImpData[]
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const entitiesRef = useRef<Map<string, CharacterEntity>>(new Map())
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const { sprites, ready } = useGameSprites()
  const { subscribe } = useGameAnimation()
  const [scale, setScale] = useState(2)
  const impsRef = useRef(imps)
  const selectedRef = useRef(selectedImpId)

  useEffect(() => {
    impsRef.current = imps
    selectedRef.current = selectedImpId
  }, [imps, selectedImpId])

  const syncEntities = useCallback(() => {
    const map = entitiesRef.current
    const seen = new Set<string>()

    for (const imp of impsRef.current) {
      const key = imp.id.toString()
      seen.add(key)
      const existing = map.get(key)
      const isSelected = selectedRef.current === imp.id

      if (!existing) {
        map.set(key, {
          impId: key,
          owner: imp.owner,
          height: imp.height,
          displayHeight: imp.height,
          floorX: 0.3 + (parseInt(key, 10) % 5) * 0.1,
          direction: 1,
          facing: 'right',
          animState: imp.isDead ? 'dead' : 'walk',
          frame: 0,
          frameTimer: 0,
          animTimer: 0,
          jumpFrom: imp.height,
          jumpTo: imp.height,
          jumpProgress: 0,
          jumpSteps: [],
          jumpStepIndex: 0,
          tint: tintFromAddress(imp.owner),
          isDead: imp.isDead,
          isSelected,
          yOffset: 0,
        })
      } else {
        if (
          existing.animState === 'walk' &&
          !existing.isDead &&
          existing.height !== imp.height
        ) {
          existing.height = imp.height
          existing.displayHeight = imp.height
        } else if (existing.isDead !== imp.isDead) {
          existing.isDead = imp.isDead
          existing.animState = imp.isDead ? 'dead' : 'walk'
          existing.height = imp.height
          existing.displayHeight = imp.height
        } else if (
          existing.animState !== 'jump' &&
          existing.animState !== 'commit' &&
          existing.animState !== 'revealPending'
        ) {
          existing.height = imp.height
          if (existing.animState === 'walk') existing.displayHeight = imp.height
        }
        existing.isSelected = isSelected
        existing.owner = imp.owner
      }
    }

    for (const key of map.keys()) {
      if (!seen.has(key)) map.delete(key)
    }
  }, [])

  useEffect(() => {
    return subscribe((event) => {
      const entity = entitiesRef.current.get(event.impId.toString())
      if (!entity || entity.isDead) return

      if (event.type === 'commit') {
        entity.animState = 'commit'
        entity.animTimer = 0
        entity.frame = 0
      } else if (event.type === 'revealPending') {
        entity.animState = 'revealPending'
        entity.animTimer = 0
      } else if (event.type === 'reveal') {
        const steps = buildJumpSteps(entity.displayHeight, event.newHeight)
        if (steps.length === 0) {
          entity.displayHeight = event.newHeight
          entity.height = event.newHeight
          entity.animState = 'walk'
          return
        }
        entity.animState = 'jump'
        entity.jumpFrom = entity.displayHeight
        entity.jumpTo = event.newHeight
        entity.jumpSteps = steps
        entity.jumpStepIndex = 0
        entity.jumpProgress = 0
        entity.animTimer = 0
        entity.facing = event.dice > 0 ? 'up' : 'down'
        entity.height = event.newHeight
      }
    })
  }, [subscribe])

  useEffect(() => {
    syncEntities()
  }, [imps, selectedImpId, syncEntities])

  useEffect(() => {
    if (!ready || !sprites) return

    if (!offscreenRef.current) {
      const c = document.createElement('canvas')
      c.width = SPRITE_SIZE
      c.height = SPRITE_SIZE
      offscreenRef.current = c
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = (time: number) => {
      const dt = Math.min(32, time - lastTimeRef.current || 16)
      lastTimeRef.current = time
      syncEntities()

      for (const entity of entitiesRef.current.values()) {
        entity.frameTimer += dt
        entity.animTimer += dt

        if (entity.animState === 'walk' && !entity.isDead) {
          const speed = 0.000035 * dt
          entity.floorX += speed * entity.direction
          if (entity.floorX >= 0.88) {
            entity.floorX = 0.88
            entity.direction = -1
            entity.facing = 'left'
          } else if (entity.floorX <= 0.12) {
            entity.floorX = 0.12
            entity.direction = 1
            entity.facing = 'right'
          }
          if (entity.frameTimer > 140) {
            entity.frameTimer = 0
            entity.frame = (entity.frame + 1) % 4
          }
          entity.yOffset = 0
        } else if (entity.animState === 'commit') {
          entity.frame = entity.animTimer < 250 ? 0 : 1
          entity.yOffset = entity.animTimer < 200 ? 2 : entity.animTimer < 400 ? -10 : -4
          if (entity.animTimer > 550) {
            entity.animState = 'walk'
            entity.yOffset = 0
            entity.animTimer = 0
          }
        } else if (entity.animState === 'revealPending') {
          entity.yOffset = Math.sin(entity.animTimer / 80) * 3
          if (entity.animTimer > 800) {
            entity.animState = 'walk'
            entity.yOffset = 0
          }
        } else if (entity.animState === 'jump') {
          const stepDuration = 380
          entity.jumpProgress = Math.min(1, entity.animTimer / stepDuration)
          const t = entity.jumpProgress
          const arc = Math.sin(t * Math.PI) * 18
          const fromY = entity.jumpStepIndex === 0
            ? entity.jumpFrom
            : entity.jumpSteps[entity.jumpStepIndex - 1]
          const toH = entity.jumpSteps[entity.jumpStepIndex] ?? entity.jumpTo
          entity.displayHeight = fromY + (toH - fromY) * t
          entity.yOffset = -arc
          entity.frame = Math.floor(entity.animTimer / 100) % 4
          if (entity.jumpProgress >= 1) {
            entity.jumpStepIndex++
            entity.animTimer = 0
            entity.jumpProgress = 0
            if (entity.jumpStepIndex >= entity.jumpSteps.length) {
              entity.displayHeight = entity.jumpTo
              entity.animState = 'walk'
              entity.yOffset = 0
              entity.facing = entity.direction > 0 ? 'right' : 'left'
            }
          }
        } else if (entity.isDead) {
          entity.yOffset = 6
          entity.frame = 0
        }
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

      for (let level = FLOOR_MAX; level >= FLOOR_MIN; level--) {
        const y = yForLevel(level, PADDING_TOP, FLOOR_GAP)
        const pw = floorWidth(level, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = (CANVAS_W - pw) / 2
        const isCenter = level === 0
        const isSummit = level === FLOOR_MAX
        const isAbyss = level === FLOOR_MIN

        const tile = isAbyss || level < -10 ? sprites.hills : sprites.grass
        const tileW = tile.width / 2
        for (let tx = 0; tx < pw; tx += tileW) {
          const drawW = Math.min(tileW, pw - tx)
          ctx.drawImage(tile, 0, 0, drawW, tile.height, px + tx, y - 4, drawW, 10)
        }

        let borderColor = '#3f3f46'
        if (isSummit) borderColor = '#34d399'
        else if (isAbyss) borderColor = '#f87171'
        else if (isCenter) borderColor = '#fbbf24'

        ctx.fillStyle = borderColor
        ctx.fillRect(px, y + 5, pw, 2)

        if (isSummit || isAbyss || isCenter || level % 6 === 0) {
          ctx.font = '10px monospace'
          ctx.fillStyle = isSummit ? '#34d399' : isAbyss ? '#f87171' : isCenter ? '#fbbf24' : '#71717a'
          ctx.textAlign = 'right'
          ctx.fillText(level > 0 ? `+${level}` : `${level}`, px - 8, y + 8)
        }
      }

      const sorted = [...entitiesRef.current.values()].sort(
        (a, b) => a.displayHeight - b.displayHeight,
      )

      for (const entity of sorted) {
        const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = (CANVAS_W - pw) / 2
        const floorY = yForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
        const charX = px + entity.floorX * pw - DISPLAY_SIZE / 2
        const charY = floorY - DISPLAY_SIZE + 8 + entity.yOffset

        const row = DIRECTION_ROW[entity.facing]
        const col = entity.frame % 4
        const sx = col * SPRITE_SIZE
        const sy = row * SPRITE_SIZE

        drawTintedFrame(
          ctx,
          offscreenRef.current!,
          sprites.walk,
          sx,
          sy,
          charX,
          charY,
          DISPLAY_SIZE,
          entity.tint,
          entity.isDead,
        )

        if (entity.isSelected) {
          ctx.strokeStyle = '#a78bfa'
          ctx.lineWidth = 2
          ctx.strokeRect(charX - 2, charY - 2, DISPLAY_SIZE + 4, DISPLAY_SIZE + 4)
        }

        if (entity.isSelected || entity.isDead) {
          ctx.font = '9px monospace'
          ctx.fillStyle = entity.isDead ? '#71717a' : '#e4e4e7'
          ctx.textAlign = 'center'
          const label = entity.isSelected
            ? `#${entity.impId} ${shortAddress(entity.owner)}`
            : `#${entity.impId}`
          ctx.fillText(label, charX + DISPLAY_SIZE / 2, charY - 4)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, sprites, syncEntities])

  useEffect(() => {
    const updateScale = () => {
      const container = canvasRef.current?.parentElement
      if (!container) return
      const fit = Math.floor(Math.min(container.clientWidth / CANVAS_W, 1.6))
      setScale(Math.max(1, fit))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H

    let closest: { id: string; dist: number } | null = null
    for (const entity of entitiesRef.current.values()) {
      const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
      const px = (CANVAS_W - pw) / 2
      const floorY = yForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
      const charX = px + entity.floorX * pw
      const charY = floorY - DISPLAY_SIZE / 2 + 8
      const dx = x - charX
      const dy = y - charY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < DISPLAY_SIZE && (!closest || dist < closest.dist)) {
        closest = { id: entity.impId, dist }
      }
    }
    if (closest) onSelectImp(BigInt(closest.id))
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onClick={handleClick}
        className="mx-auto cursor-pointer"
        style={{
          width: CANVAS_W * scale,
          height: CANVAS_H * scale,
          imageRendering: 'pixelated',
        }}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 text-sm text-zinc-400">
          Loading sprites…
        </div>
      )}
    </div>
  )
}
