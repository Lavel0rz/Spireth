'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameSprites } from '@/hooks/useGameSprites'
import { useGameAnimation } from '@/context/GameAnimationContext'
import {
  DIRECTION_ROW,
  DISPLAY_SIZE,
  FLOOR_MAX,
  FLOOR_MIN,
  PLATFORM_DRAW_H,
  PLATFORM_TILE_SIZE,
  PLATFORM_TILE_SRC_H,
  PLATFORM_TILE_SRC_Y,
  SPRITE_SIZE,
  type Direction,
  type ImpData,
  floorWidth,
  laneBounds,
  shortAddress,
  tintFromAddress,
  yForLevel,
} from '@/lib/gameUtils'

const CANVAS_W = 440
const PADDING_TOP = 28
const FLOOR_GAP = 11
const MAX_PLATFORM_W = 360
const MIN_PLATFORM_W = 72
const FOOT_RATIO = 42 / SPRITE_SIZE
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
  outlineCanvas: HTMLCanvasElement,
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
  const outlineCtx = outlineCanvas.getContext('2d')
  if (!offCtx || !outlineCtx) return

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

  outlineCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  outlineCtx.drawImage(offscreen, 0, 0)
  outlineCtx.globalCompositeOperation = 'source-in'
  outlineCtx.fillStyle = 'rgba(0, 0, 0, 0.88)'
  outlineCtx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  outlineCtx.globalCompositeOperation = 'source-over'

  ctx.imageSmoothingEnabled = false
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    ctx.drawImage(outlineCanvas, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx + ox, dy + oy, size, size)
  }
  ctx.drawImage(offscreen, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, size, size)
}

function drawPlatformStrip(
  ctx: CanvasRenderingContext2D,
  tile: HTMLImageElement,
  px: number,
  y: number,
  pw: number,
  variant: 'grass' | 'stone' | 'hills',
) {
  ctx.imageSmoothingEnabled = false
  const topY = y - PLATFORM_DRAW_H + 2

  const source =
    variant === 'stone'
      ? { sx: 80, sy: 0, sw: 48, sh: 16 }
      : variant === 'hills'
        ? { sx: 0, sy: 0, sw: 48, sh: 16 }
        : { sx: 0, sy: PLATFORM_TILE_SRC_Y, sw: PLATFORM_TILE_SIZE, sh: PLATFORM_TILE_SRC_H }

  for (let tx = 0; tx < pw; tx += PLATFORM_TILE_SIZE) {
    const drawW = Math.min(PLATFORM_TILE_SIZE, pw - tx)
    ctx.drawImage(
      tile,
      source.sx,
      source.sy,
      Math.min(source.sw, drawW),
      source.sh,
      px + tx,
      topY,
      drawW,
      PLATFORM_DRAW_H,
    )
  }
}

function platformTileForLevel(
  level: number,
  sprites: NonNullable<ReturnType<typeof useGameSprites>['sprites']>,
): { tile: HTMLImageElement; variant: 'grass' | 'stone' | 'hills' } {
  const isSummit = level === FLOOR_MAX
  const isAbyss = level === FLOOR_MIN

  if (isAbyss || level <= -18) return { tile: sprites.hills, variant: 'hills' }
  if (isSummit || level >= 22) return { tile: sprites.grass, variant: 'grass' }
  if (level === 0) return { tile: sprites.grass, variant: 'grass' }
  return { tile: sprites.stone, variant: 'stone' }
}

function charYOnFloor(floorY: number, yOffset: number): number {
  const platformTop = floorY - PLATFORM_DRAW_H + 2
  return platformTop - DISPLAY_SIZE * FOOT_RATIO + yOffset
}

function buildJumpSteps(from: number, to: number): number[] {
  const steps: number[] = []
  const dir = to > from ? 1 : -1
  for (let h = from + dir; dir > 0 ? h <= to : h >= to; h += dir) {
    steps.push(h)
  }
  return steps
}

function peersOnFloor(entities: Map<string, CharacterEntity>, height: number): string[] {
  return [...entities.values()]
    .filter((e) => Math.round(e.displayHeight) === height)
    .map((e) => e.impId)
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
  const outlineRef = useRef<HTMLCanvasElement | null>(null)
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
      const peerIds = impsRef.current
        .filter((i) => i.height === imp.height)
        .map((i) => i.id.toString())
      const lane = laneBounds(key, peerIds)

      if (!existing) {
        map.set(key, {
          impId: key,
          owner: imp.owner,
          height: imp.height,
          displayHeight: imp.height,
          floorX: lane.center,
          direction: parseInt(key, 10) % 2 === 0 ? 1 : -1,
          facing: parseInt(key, 10) % 2 === 0 ? 'right' : 'left',
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
          const newLane = laneBounds(
            key,
            impsRef.current.filter((i) => i.height === imp.height).map((i) => i.id.toString()),
          )
          existing.floorX = newLane.center
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
        existing.tint = tintFromAddress(imp.owner)
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
    if (!outlineRef.current) {
      const c = document.createElement('canvas')
      c.width = SPRITE_SIZE
      c.height = SPRITE_SIZE
      outlineRef.current = c
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

        const floorHeight = Math.round(entity.displayHeight)
        const lane = laneBounds(entity.impId, peersOnFloor(entitiesRef.current, floorHeight))

        if (entity.animState === 'walk' && !entity.isDead) {
          const speed = 0.00003 * dt
          entity.floorX += speed * entity.direction
          if (entity.floorX >= lane.max) {
            entity.floorX = lane.max
            entity.direction = -1
            entity.facing = 'left'
          } else if (entity.floorX <= lane.min) {
            entity.floorX = lane.min
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
          const arc = Math.sin(t * Math.PI) * 14
          const fromY =
            entity.jumpStepIndex === 0
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
          entity.yOffset = 4
          entity.frame = 0
        }
      }

      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

      for (let level = FLOOR_MAX; level >= FLOOR_MIN; level--) {
        const y = yForLevel(level, PADDING_TOP, FLOOR_GAP)
        const pw = floorWidth(level, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = (CANVAS_W - pw) / 2
        const isCenter = level === 0
        const isSummit = level === FLOOR_MAX
        const isAbyss = level === FLOOR_MIN

        const { tile, variant } = platformTileForLevel(level, sprites)
        drawPlatformStrip(ctx, tile, px, y, pw, variant)

        if (level <= -22) {
          ctx.imageSmoothingEnabled = false
          const waterY = y + 4
          for (let tx = 0; tx < pw; tx += 16) {
            ctx.drawImage(sprites.water, 0, 0, 16, sprites.water.height, px + tx, waterY, 16, 5)
          }
        }

        let borderColor = '#52525b'
        if (isSummit) borderColor = '#34d399'
        else if (isAbyss) borderColor = '#f87171'
        else if (isCenter) borderColor = '#fbbf24'

        ctx.fillStyle = borderColor
        ctx.fillRect(px, y + 3, pw, 1)

        if (isSummit || isAbyss || isCenter || level % 6 === 0) {
          ctx.font = '10px monospace'
          ctx.fillStyle = isSummit ? '#34d399' : isAbyss ? '#f87171' : isCenter ? '#fbbf24' : '#71717a'
          ctx.textAlign = 'right'
          ctx.fillText(level > 0 ? `+${level}` : `${level}`, px - 8, y + 6)
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
        const charY = charYOnFloor(floorY, entity.yOffset)

        const useActions =
          entity.animState === 'commit' ||
          entity.animState === 'revealPending' ||
          entity.animState === 'jump'

        if (useActions) {
          let actionRow = 0
          let actionCol = 0
          if (entity.animState === 'commit') {
            actionRow = 0
            actionCol = entity.animTimer < 250 ? 0 : 1
          } else if (entity.animState === 'revealPending') {
            actionRow = 0
            actionCol = Math.floor(entity.animTimer / 120) % 2
          } else if (entity.facing === 'up') {
            actionRow = 0
            actionCol = entity.jumpProgress < 0.5 ? 1 : 0
          } else if (entity.facing === 'down') {
            actionRow = 2
            actionCol = entity.jumpProgress < 0.5 ? 1 : 0
          } else {
            actionRow = entity.facing === 'right' ? 2 : 3
            actionCol = entity.frame % 2
          }
          drawTintedFrame(
            ctx,
            offscreenRef.current!,
            outlineRef.current!,
            sprites.actions,
            actionCol * SPRITE_SIZE,
            actionRow * SPRITE_SIZE,
            charX,
            charY,
            DISPLAY_SIZE,
            entity.tint,
            entity.isDead,
          )
        } else {
          const row = DIRECTION_ROW[entity.facing]
          const col = entity.frame % 4
          drawTintedFrame(
            ctx,
            offscreenRef.current!,
            outlineRef.current!,
            sprites.walk,
            col * SPRITE_SIZE,
            row * SPRITE_SIZE,
            charX,
            charY,
            DISPLAY_SIZE,
            entity.tint,
            entity.isDead,
          )
        }

        if (entity.isSelected) {
          ctx.imageSmoothingEnabled = false
          ctx.strokeStyle = 'rgba(196, 181, 253, 0.95)'
          ctx.lineWidth = 1
          ctx.shadowColor = 'rgba(167, 139, 250, 0.7)'
          ctx.shadowBlur = 6
          ctx.strokeRect(charX + 0.5, charY + 0.5, DISPLAY_SIZE - 1, DISPLAY_SIZE - 1)
          ctx.shadowBlur = 0
        }

        if (entity.isSelected || entity.isDead) {
          ctx.font = '9px monospace'
          ctx.textAlign = 'center'
          const label = entity.isSelected
            ? `#${entity.impId} ${shortAddress(entity.owner)}`
            : `#${entity.impId}`
          const labelY = charY - 5
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
          ctx.fillText(label, charX + DISPLAY_SIZE / 2 + 1, labelY + 1)
          ctx.fillStyle = entity.isDead ? '#a1a1aa' : '#f4f4f5'
          ctx.fillText(label, charX + DISPLAY_SIZE / 2, labelY)
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
      const charY = charYOnFloor(floorY, 0) + DISPLAY_SIZE / 2
      const dx = x - charX
      const dy = y - charY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < DISPLAY_SIZE * 0.65 && (!closest || dist < closest.dist)) {
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
