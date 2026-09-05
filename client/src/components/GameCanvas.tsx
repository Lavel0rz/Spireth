'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameSprites } from '@/hooks/useGameSprites'
import { useGameAnimation } from '@/context/GameAnimationContext'
import {
  BOARD_CANVAS_H,
  BOARD_CANVAS_W,
  BOARD_FLOOR_GAP,
  BOARD_PADDING_TOP,
  BILLBOARD_PLATFORM_H,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  FLOOR_MAX,
  FLOOR_MIN,
  FRAME_FOOT_Y,
  FRAME_H,
  FRAME_W,
  PLATFORM_DRAW_H,
  PLATFORM_MAX_W,
  PLATFORM_MIN_W,
  PLATFORM_STRIP_SOURCES,
  PLATFORM_TILE_SIZE,
  floorHalfWidth,
  floorWidth,
  laneBounds,
  resolvePepeFrame,
  shortAddress,
  jumpDurationMs,
  shouldShowFloorLabel,
  tintFromAddress,
  boardYForLevel,
  type ImpData,
  type PepeFrame,
} from '@/lib/gameUtils'
import type { BillboardData } from '@/components/Board'

const CANVAS_W = BOARD_CANVAS_W
const PADDING_TOP = BOARD_PADDING_TOP
const FLOOR_GAP = BOARD_FLOOR_GAP
const MAX_PLATFORM_W = PLATFORM_MAX_W
const MIN_PLATFORM_W = PLATFORM_MIN_W
const CANVAS_H = BOARD_CANVAS_H
const CENTER_X = CANVAS_W / 2
const HIT_RADIUS_RATIO = 0.65
const CROWDED_FLOOR_THRESHOLD = 4
const VERY_LARGE_SIM_THRESHOLD = 500
const CROWDED_SPRITE_SCALE = 0.88
const VERY_LARGE_SPRITE_SCALE = 0.78
const JUMP_ARC_HEIGHT = 7
const COMMIT_BOUNCE = { dip: 1, peak: -5, settle: -2 } as const
const MAX_DRAW_PER_FLOOR = 8
const DEAD_SKIP_MS = 1000

const textWidthCache = new Map<string, number>()
const tintedSpriteCache = new Map<string, HTMLCanvasElement>()
const MAX_TINTED_CACHE_SIZE = 2000

function getCachedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
): number {
  const key = `${font}|${text}`
  let width = textWidthCache.get(key)
  if (width === undefined) {
    ctx.font = font
    width = ctx.measureText(text).width
    textWidthCache.set(key, width)
  }
  return width
}

function getTintedFrameCacheKey(
  frame: PepeFrame,
  tint: [number, number, number],
  greyscale: boolean,
  noOutline: boolean,
): string {
  return `${frame.col}|${frame.row}|${frame.flipX ? 1 : 0}|${tint[0]}|${tint[1]}|${tint[2]}|${greyscale ? 1 : 0}|${noOutline ? 1 : 0}`
}

type AnimState = 'walk' | 'commit' | 'revealPending' | 'jump' | 'dead'

interface CharacterEntity {
  impId: string
  owner: string
  height: number
  displayHeight: number
  floorX: number
  direction: 1 | -1
  facing: 'down' | 'up' | 'left' | 'right'
  animState: AnimState
  frame: number
  frameTimer: number
  animTimer: number
  jumpFrom: number
  jumpTo: number
  jumpProgress: number
  jumpDuration: number
  tint: [number, number, number]
  isDead: boolean
  deadSince: number
  isSelected: boolean
  yOffset: number
  dice: number | null
  diceShowUntil: number
}

export interface GameCanvasDisplayMetrics {
  displayHeight: number
  displayWidth: number
  fitScale: number
}

function createTintedFrame(
  offscreen: HTMLCanvasElement,
  outlineCanvas: HTMLCanvasElement,
  image: HTMLImageElement,
  frame: PepeFrame,
  tint: [number, number, number],
  greyscale: boolean,
  noOutline: boolean,
): HTMLCanvasElement {
  const offCtx = offscreen.getContext('2d')!

  const { col, row, flipX } = frame
  const sx = col * FRAME_W
  const sy = row * FRAME_H

  offCtx.clearRect(0, 0, FRAME_W, FRAME_H)
  if (flipX) {
    offCtx.save()
    offCtx.translate(FRAME_W, 0)
    offCtx.scale(-1, 1)
    offCtx.drawImage(image, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
    offCtx.restore()
  } else {
    offCtx.drawImage(image, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
  }

  const imgData = offCtx.getImageData(0, 0, FRAME_W, FRAME_H)
  for (let i = 0; i < imgData.data.length; i += 4) {
    const lum = imgData.data[i] * 0.3 + imgData.data[i + 1] * 0.59 + imgData.data[i + 2] * 0.11
    if (lum < 15) {
      imgData.data[i + 3] = 0
      continue
    }
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
    imgData.data[i + 3] = 255
  }
  offCtx.putImageData(imgData, 0, 0)

  if (noOutline) {
    const cachedCanvas = document.createElement('canvas')
    cachedCanvas.width = FRAME_W + 2
    cachedCanvas.height = FRAME_H + 2
    const cachedCtx = cachedCanvas.getContext('2d')!
    cachedCtx.imageSmoothingEnabled = false
    cachedCtx.drawImage(offscreen, 1, 1)
    return cachedCanvas
  }

  const outlineCtx = outlineCanvas.getContext('2d')!
  outlineCtx.clearRect(0, 0, FRAME_W, FRAME_H)
  outlineCtx.drawImage(offscreen, 0, 0)
  outlineCtx.globalCompositeOperation = 'source-in'
  outlineCtx.fillStyle = 'rgba(0, 0, 0, 0.88)'
  outlineCtx.fillRect(0, 0, FRAME_W, FRAME_H)
  outlineCtx.globalCompositeOperation = 'source-over'

  const cachedCanvas = document.createElement('canvas')
  cachedCanvas.width = FRAME_W + 2
  cachedCanvas.height = FRAME_H + 2
  const cachedCtx = cachedCanvas.getContext('2d')!
  cachedCtx.imageSmoothingEnabled = false
  for (const [ox, oy] of [
    [0, 1],
    [2, 1],
    [1, 0],
    [1, 2],
  ] as const) {
    cachedCtx.drawImage(outlineCanvas, ox, oy)
  }
  cachedCtx.drawImage(offscreen, 1, 1)

  return cachedCanvas
}

function drawTintedFrame(
  ctx: CanvasRenderingContext2D,
  offscreen: HTMLCanvasElement,
  outlineCanvas: HTMLCanvasElement,
  image: HTMLImageElement,
  frame: PepeFrame,
  dx: number,
  dy: number,
  drawW: number,
  drawH: number,
  tint: [number, number, number],
  greyscale = false,
  noOutline = false,
) {
  const offCtx = offscreen.getContext('2d')
  const outlineCtx = outlineCanvas.getContext('2d')
  if (!offCtx || !outlineCtx) return

  const cacheKey = getTintedFrameCacheKey(frame, tint, greyscale, noOutline)
  let cachedFrame = tintedSpriteCache.get(cacheKey)

  if (!cachedFrame) {
    if (tintedSpriteCache.size >= MAX_TINTED_CACHE_SIZE) {
      const firstKey = tintedSpriteCache.keys().next().value
      if (firstKey) tintedSpriteCache.delete(firstKey)
    }
    cachedFrame = createTintedFrame(offscreen, outlineCanvas, image, frame, tint, greyscale, noOutline)
    tintedSpriteCache.set(cacheKey, cachedFrame)
  }

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(cachedFrame, 0, 0, FRAME_W + 2, FRAME_H + 2, dx - 1, dy - 1, drawW + 2, drawH + 2)
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
  const source = PLATFORM_STRIP_SOURCES[variant]

  ctx.save()
  ctx.beginPath()
  ctx.rect(px, topY, pw, PLATFORM_DRAW_H)
  ctx.clip()

  if (pw <= PLATFORM_TILE_SIZE) {
    ctx.drawImage(tile, source.sx, source.sy, source.sw, source.sh, px, topY, pw, PLATFORM_DRAW_H)
  } else {
    for (let tx = 0; tx < pw; tx += PLATFORM_TILE_SIZE) {
      const drawW = Math.min(PLATFORM_TILE_SIZE, pw - tx)
      ctx.drawImage(
        tile,
        source.sx,
        source.sy,
        source.sw,
        source.sh,
        px + tx,
        topY,
        drawW,
        PLATFORM_DRAW_H,
      )
    }
  }

  ctx.restore()
}

function drawRhombusOutline(ctx: CanvasRenderingContext2D) {
  const summitY = boardYForLevel(FLOOR_MAX, PADDING_TOP, FLOOR_GAP)
  const abyssY = boardYForLevel(FLOOR_MIN, PADDING_TOP, FLOOR_GAP)
  const midY = boardYForLevel(0, PADDING_TOP, FLOOR_GAP)

  const summitHalf = floorHalfWidth(FLOOR_MAX, MAX_PLATFORM_W, MIN_PLATFORM_W)
  const abyssHalf = floorHalfWidth(FLOOR_MIN, MAX_PLATFORM_W, MIN_PLATFORM_W)
  const midHalf = floorHalfWidth(0, MAX_PLATFORM_W, MIN_PLATFORM_W)

  ctx.imageSmoothingEnabled = false
  ctx.strokeStyle = 'rgba(161, 161, 170, 0.45)'
  ctx.lineWidth = 1

  ctx.beginPath()
  ctx.moveTo(CENTER_X, summitY - PLATFORM_DRAW_H + 4)
  ctx.lineTo(CENTER_X - midHalf, midY)
  ctx.lineTo(CENTER_X - abyssHalf, abyssY + 4)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(CENTER_X, summitY - PLATFORM_DRAW_H + 4)
  ctx.lineTo(CENTER_X + midHalf, midY)
  ctx.lineTo(CENTER_X + abyssHalf, abyssY + 4)
  ctx.stroke()
}

function platformTileForLevel(
  level: number,
  sprites: NonNullable<ReturnType<typeof useGameSprites>['sprites']>,
): { tile: HTMLImageElement; variant: 'grass' | 'stone' | 'hills' } {
  const isSummit = level === FLOOR_MAX
  const isAbyss = level === FLOOR_MIN

  if (isAbyss || level <= -36) return { tile: sprites.hills, variant: 'hills' }
  if (isSummit || level >= 44) return { tile: sprites.grass, variant: 'grass' }
  if (level === 0) return { tile: sprites.grass, variant: 'grass' }
  return { tile: sprites.stone, variant: 'stone' }
}

function charYOnFloor(floorY: number, yOffset: number, drawH: number): number {
  const platformTop = floorY - PLATFORM_DRAW_H + 2
  const footOffset = drawH * (FRAME_FOOT_Y / FRAME_H)
  return platformTop - footOffset + yOffset
}

function spriteDrawSize(
  peerCount: number,
  totalEntities: number,
  denseRender: boolean,
): { drawW: number; drawH: number } {
  let scale = 1
  if (denseRender && totalEntities >= VERY_LARGE_SIM_THRESHOLD) {
    scale = VERY_LARGE_SPRITE_SCALE
  } else if (peerCount > CROWDED_FLOOR_THRESHOLD) {
    scale = CROWDED_SPRITE_SCALE
  }
  const drawH = DISPLAY_HEIGHT * scale
  const drawW = drawH * (DISPLAY_WIDTH / DISPLAY_HEIGHT)
  return { drawW, drawH }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function drawIdBadge(
  ctx: CanvasRenderingContext2D,
  charX: number,
  charY: number,
  drawW: number,
  impId: string,
  owner: string,
  isSelected: boolean,
  isDead: boolean,
) {
  const label = isSelected ? `#${impId} ${shortAddress(owner)}` : `#${impId}`
  const labelX = charX + drawW / 2
  const labelY = charY - 3

  const font = '8px monospace'
  const textWidth = getCachedTextWidth(ctx, label, font)
  ctx.font = font
  ctx.textAlign = 'center'
  const padX = 2
  const boxW = textWidth + padX * 2
  const boxH = 9
  const boxX = labelX - boxW / 2
  const boxY = labelY - boxH + 1

  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
  ctx.fillRect(boxX, boxY, boxW, boxH)

  if (isSelected) {
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.8)'
    ctx.lineWidth = 1
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1)
  }

  ctx.fillStyle = isDead ? '#a1a1aa' : isSelected ? '#f4f4f5' : '#d4d4d8'
  ctx.fillText(label, labelX, labelY)
}

function drawDiceBadge(
  ctx: CanvasRenderingContext2D,
  charX: number,
  charY: number,
  drawW: number,
  dice: number,
) {
  const label = dice > 0 ? `+${dice}` : `${dice}`
  const labelX = charX + drawW / 2
  const labelY = charY - 14

  const font = 'bold 7px monospace'
  const textWidth = getCachedTextWidth(ctx, label, font)
  ctx.font = font
  ctx.textAlign = 'center'
  const padX = 2
  const boxW = textWidth + padX * 2
  const boxH = 8
  const boxX = labelX - boxW / 2
  const boxY = labelY - boxH + 1

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(boxX, boxY, boxW, boxH)

  ctx.fillStyle = dice > 0 ? '#34d399' : '#f87171'
  ctx.fillText(label, labelX, labelY)
}

export function GameCanvas({
  imps,
  selectedImpId,
  onSelectImp,
  onDisplayMetrics,
  billboard,
  denseRender = false,
}: {
  imps: ImpData[]
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
  onDisplayMetrics?: (metrics: GameCanvasDisplayMetrics) => void
  billboard: BillboardData | null
  /** 1k sim perf LOD — does not change per-Pepe sprite style (live matches sim art). */
  denseRender?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const outlineRef = useRef<HTMLCanvasElement | null>(null)
  const entitiesRef = useRef<Map<string, CharacterEntity>>(new Map())
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const frameCountRef = useRef<number>(0)
  const floorPeerCacheRef = useRef<Map<number, string[]>>(new Map())
  const { sprites, ready } = useGameSprites()
  const { subscribe } = useGameAnimation()
  const [fitScale, setFitScale] = useState(1)
  const impsRef = useRef(imps)
  const selectedRef = useRef(selectedImpId)
  const expandedFloorRef = useRef<number | null>(null)
  const [expandedFloor, setExpandedFloor] = useState<number | null>(null)
  const billboardRef = useRef(billboard)
  const denseRenderRef = useRef(denseRender)

  useEffect(() => {
    impsRef.current = imps
    selectedRef.current = selectedImpId
    expandedFloorRef.current = expandedFloor
    billboardRef.current = billboard
    denseRenderRef.current = denseRender
  }, [imps, selectedImpId, expandedFloor, billboard, denseRender])

  const displayWidth = CANVAS_W * fitScale
  const displayHeight = CANVAS_H * fitScale

  useEffect(() => {
    onDisplayMetrics?.({ displayHeight, displayWidth, fitScale })
  }, [displayHeight, displayWidth, fitScale, onDisplayMetrics])

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
          jumpDuration: 0,
          tint: tintFromAddress(imp.owner),
          isDead: imp.isDead,
          deadSince: imp.isDead ? Date.now() : 0,
          isSelected,
          yOffset: 0,
          dice: null,
          diceShowUntil: 0,
        })
      } else {
        if (existing.animState === 'jump') {
          existing.isSelected = isSelected
          existing.owner = imp.owner
          existing.tint = tintFromAddress(imp.owner)
          existing.isDead = imp.isDead
          continue
        }

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
          existing.deadSince = imp.isDead ? Date.now() : 0
          existing.animState = imp.isDead ? 'dead' : 'walk'
          existing.height = imp.height
          existing.displayHeight = imp.height
        } else if (
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
        entity.dice = event.dice
        if (event.newHeight === entity.displayHeight) {
          entity.animState = 'walk'
          entity.diceShowUntil = Date.now() + 600
          return
        }
        entity.animState = 'jump'
        entity.jumpFrom = entity.displayHeight
        entity.jumpTo = event.newHeight
        entity.jumpProgress = 0
        entity.jumpDuration = jumpDurationMs(entity.jumpFrom, entity.jumpTo)
        entity.animTimer = 0
        entity.facing = event.dice > 0 ? 'up' : 'down'
        entity.diceShowUntil = Date.now() + entity.jumpDuration + 400
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
      c.width = FRAME_W
      c.height = FRAME_H
      offscreenRef.current = c
    }
    if (!outlineRef.current) {
      const c = document.createElement('canvas')
      c.width = FRAME_W
      c.height = FRAME_H
      outlineRef.current = c
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = (time: number) => {
      const dt = Math.min(32, time - lastTimeRef.current || 16)
      lastTimeRef.current = time
      frameCountRef.current += 1
      syncEntities()

      const totalEntities = entitiesRef.current.size
      const denseRender = denseRenderRef.current
      const isOddFrame = frameCountRef.current % 2 === 1
      const now = Date.now()

      const floorPeerCounts = new Map<number, number>()
      const floorPeerCache = floorPeerCacheRef.current
      floorPeerCache.clear()
      for (const entity of entitiesRef.current.values()) {
        const h = Math.round(entity.displayHeight)
        floorPeerCounts.set(h, (floorPeerCounts.get(h) ?? 0) + 1)
        let peers = floorPeerCache.get(h)
        if (!peers) {
          peers = []
          floorPeerCache.set(h, peers)
        }
        peers.push(entity.impId)
      }

      for (const entity of entitiesRef.current.values()) {
        entity.frameTimer += dt
        entity.animTimer += dt

        const floorHeight = Math.round(entity.displayHeight)
        const peerIds = floorPeerCache.get(floorHeight) ?? []
        const isExpanded = expandedFloorRef.current === floorHeight
        const lane = laneBounds(entity.impId, peerIds, isExpanded)

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
          const shouldAdvanceFrame = !denseRender || entity.isSelected || !isOddFrame
          if (shouldAdvanceFrame && entity.frameTimer > 140) {
            entity.frameTimer = 0
            entity.frame = (entity.frame + 1) % 4
          }
          entity.yOffset = 0
        } else if (entity.animState === 'commit') {
          entity.frame = entity.animTimer < 250 ? 0 : 1
          entity.yOffset =
            entity.animTimer < 200
              ? COMMIT_BOUNCE.dip
              : entity.animTimer < 400
                ? COMMIT_BOUNCE.peak
                : COMMIT_BOUNCE.settle
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
          const duration = entity.jumpDuration || 1
          entity.jumpProgress = Math.min(1, entity.animTimer / duration)
          const t = entity.jumpProgress
          const eased = easeInOutCubic(t)
          entity.displayHeight = entity.jumpFrom + (entity.jumpTo - entity.jumpFrom) * eased
          entity.yOffset = -Math.sin(t * Math.PI) * JUMP_ARC_HEIGHT
          if (entity.frameTimer > 100) {
            entity.frameTimer = 0
            entity.frame = (entity.frame + 1) % 2
          }
          if (entity.jumpProgress >= 1) {
            entity.displayHeight = entity.jumpTo
            entity.height = entity.jumpTo
            entity.animState = 'walk'
            entity.yOffset = 0
            entity.facing = entity.direction > 0 ? 'right' : 'left'
            const landedPeers = floorPeerCache.get(entity.jumpTo) ?? []
            const landedLane = laneBounds(entity.impId, landedPeers)
            entity.floorX = landedLane.center
          }
        } else if (entity.isDead) {
          entity.yOffset = 2
          entity.frame = 0
        }
      }

      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

      drawRhombusOutline(ctx)

      for (let level = FLOOR_MAX; level >= FLOOR_MIN; level--) {
        const y = boardYForLevel(level, PADDING_TOP, FLOOR_GAP)
        const pw = floorWidth(level, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = CENTER_X - pw / 2
        const isCenter = level === 0
        const isSummit = level === FLOOR_MAX
        const isAbyss = level === FLOOR_MIN

        const { tile, variant } = platformTileForLevel(level, sprites)
        
        if (isCenter) {
          const stripTopY = y - PLATFORM_DRAW_H + 2
          ctx.imageSmoothingEnabled = false
          ctx.save()
          ctx.beginPath()
          ctx.rect(px, stripTopY, pw, BILLBOARD_PLATFORM_H)
          ctx.clip()
          for (let tx = 0; tx < pw; tx += PLATFORM_TILE_SIZE) {
            const drawW = Math.min(PLATFORM_TILE_SIZE, pw - tx)
            ctx.drawImage(
              tile,
              PLATFORM_STRIP_SOURCES[variant].sx,
              PLATFORM_STRIP_SOURCES[variant].sy,
              PLATFORM_STRIP_SOURCES[variant].sw,
              PLATFORM_STRIP_SOURCES[variant].sh,
              px + tx,
              stripTopY,
              drawW,
              BILLBOARD_PLATFORM_H,
            )
          }
          ctx.restore()
        } else {
          drawPlatformStrip(ctx, tile, px, y, pw, variant)
        }

        if (level <= -44) {
          ctx.imageSmoothingEnabled = false
          const waterY = y + 4
          ctx.save()
          ctx.beginPath()
          ctx.rect(px, waterY, pw, 5)
          ctx.clip()
          for (let tx = 0; tx < pw; tx += 16) {
            ctx.drawImage(sprites.water, 0, 0, 16, sprites.water.height, px + tx, waterY, 16, 5)
          }
          ctx.restore()
        }

        let borderColor = '#52525b'
        if (isSummit) borderColor = '#34d399'
        else if (isAbyss) borderColor = '#f87171'
        else if (isCenter) borderColor = '#fbbf24'

        if (!isCenter) {
          ctx.fillStyle = borderColor
          ctx.fillRect(px, y + 3, pw, 1)
        }

        if (shouldShowFloorLabel(level)) {
          ctx.font = '10px monospace'
          ctx.fillStyle = isSummit ? '#34d399' : isAbyss ? '#f87171' : isCenter ? '#fbbf24' : '#71717a'
          ctx.textAlign = 'right'
          ctx.fillText(level > 0 ? `+${level}` : `${level}`, px - 8, y + 6)
        }
      }

      let sorted = [...entitiesRef.current.values()].sort(
        (a, b) => a.displayHeight - b.displayHeight,
      )

      if (denseRender) {
        sorted = sorted.filter((e) => {
          if (!e.isDead) return true
          if (e.isSelected) return true
          return now - e.deadSince < DEAD_SKIP_MS
        })
      }

      const floorDrawCounts = new Map<number, number>()

      const drawEntities = (belowBillboard: boolean) => {
        for (const entity of sorted) {
          const isBelowBillboard = entity.displayHeight < 0
          if (isBelowBillboard !== belowBillboard) continue

          const floorHeight = Math.round(entity.displayHeight)

          if (denseRender && !entity.isSelected) {
            const drawn = floorDrawCounts.get(floorHeight) ?? 0
            if (drawn >= MAX_DRAW_PER_FLOOR) continue
            floorDrawCounts.set(floorHeight, drawn + 1)
          }

          const peerCount = floorPeerCounts.get(floorHeight) ?? 1
          const { drawW, drawH } = spriteDrawSize(peerCount, totalEntities, denseRender)

          const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
          const px = CENTER_X - pw / 2
          const floorY = boardYForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
          const charX = px + entity.floorX * pw - drawW / 2
          const charY = charYOnFloor(floorY, entity.yOffset, drawH)

          const pepeFrame = resolvePepeFrame(
            entity.animState,
            entity.facing,
            entity.frame,
            entity.isDead,
          )

          const useNoOutline = !entity.isSelected
          drawTintedFrame(
            ctx,
            offscreenRef.current!,
            outlineRef.current!,
            sprites.pepe,
            pepeFrame,
            charX,
            charY,
            drawW,
            drawH,
            entity.tint,
            entity.isDead,
            useNoOutline,
          )

          if (entity.isSelected) {
            ctx.imageSmoothingEnabled = false
            ctx.strokeStyle = 'rgba(196, 181, 253, 0.95)'
            ctx.lineWidth = 1
            ctx.shadowColor = 'rgba(167, 139, 250, 0.7)'
            ctx.shadowBlur = 6
            ctx.strokeRect(charX + 0.5, charY + 0.5, drawW - 1, drawH - 1)
            ctx.shadowBlur = 0
          }

          const showIdBadge = entity.isSelected || !denseRender
          if (showIdBadge) {
            drawIdBadge(
              ctx,
              charX,
              charY,
              drawW,
              entity.impId,
              entity.owner,
              entity.isSelected,
              entity.isDead,
            )
          }

          const showDice =
            entity.dice !== null &&
            (entity.animState === 'jump' || now < entity.diceShowUntil)
          const showDiceBadge = showDice && (entity.isSelected || !denseRender)
          if (showDiceBadge) {
            drawDiceBadge(ctx, charX, charY, drawW, entity.dice!)
          }
        }
      }

      // Negative floors first, then billboard, then floor 0+ so link bar never hides abyss pepes.
      drawEntities(true)

      const bb = billboardRef.current
      const floor0Y = boardYForLevel(0, PADDING_TOP, FLOOR_GAP)
      const floor0Pw = floorWidth(0, MAX_PLATFORM_W, MIN_PLATFORM_W)
      const floor0Px = CENTER_X - floor0Pw / 2
      const stripTopY = floor0Y - PLATFORM_DRAW_H + 2

      ctx.save()
      ctx.imageSmoothingEnabled = false

      ctx.fillStyle = '#3d2a1a'
      ctx.fillRect(floor0Px, stripTopY, floor0Pw, BILLBOARD_PLATFORM_H)

      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 1
      ctx.strokeRect(floor0Px + 0.5, stripTopY + 0.5, floor0Pw - 1, BILLBOARD_PLATFORM_H - 1)

      if (bb && bb.url && bb.label) {
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const maxTextWidth = floor0Pw - 16
        let labelText = bb.label
        const metrics = ctx.measureText(labelText)
        if (metrics.width > maxTextWidth) {
          while (labelText.length > 3 && ctx.measureText(labelText + '...').width > maxTextWidth) {
            labelText = labelText.slice(0, -1)
          }
          labelText = labelText + '...'
        }

        ctx.fillStyle = '#fbbf24'
        ctx.fillText(labelText, CENTER_X, stripTopY + BILLBOARD_PLATFORM_H / 2)
      }

      ctx.restore()

      drawEntities(false)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, sprites, syncEntities, denseRender])

  useEffect(() => {
    const container = viewportRef.current
    if (!container) return

    const updateScale = () => {
      const fit = Math.min(
        container.clientWidth / CANVAS_W,
        container.clientHeight / CANVAS_H,
      )
      setFitScale(Math.max(0.25, fit))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H

    const bb = billboardRef.current
    if (bb && bb.url && bb.url.startsWith('https://')) {
      const floor0Y = boardYForLevel(0, PADDING_TOP, FLOOR_GAP)
      const floor0Pw = floorWidth(0, MAX_PLATFORM_W, MIN_PLATFORM_W)
      const floor0Px = CENTER_X - floor0Pw / 2
      const stripTopY = floor0Y - PLATFORM_DRAW_H + 2
      
      if (x >= floor0Px && x <= floor0Px + floor0Pw && y >= stripTopY && y <= stripTopY + BILLBOARD_PLATFORM_H) {
        window.open(bb.url, '_blank', 'noopener,noreferrer')
        return
      }
    }

    let closest: { id: string; dist: number; floor: number } | null = null
    const totalEntities = entitiesRef.current.size
    const denseRender = denseRenderRef.current
    for (const entity of entitiesRef.current.values()) {
      const floorHeight = Math.round(entity.displayHeight)
      const peerCount = [...entitiesRef.current.values()].filter(
        (entry) => Math.round(entry.displayHeight) === floorHeight,
      ).length
      const { drawW, drawH } = spriteDrawSize(peerCount, totalEntities, denseRender)

      const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
      const px = CENTER_X - pw / 2
      const floorY = boardYForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
      const charX = px + entity.floorX * pw
      const charY = charYOnFloor(floorY, 0, drawH) + drawH / 2
      const dx = x - charX
      const dy = y - charY
      const hitR = Math.min(drawW, drawH) * HIT_RADIUS_RATIO
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < hitR && (!closest || dist < closest.dist)) {
        closest = { id: entity.impId, dist, floor: floorHeight }
      }
    }

    if (closest) {
      const peerCount = [...entitiesRef.current.values()].filter(
        (entry) => Math.round(entry.displayHeight) === closest!.floor,
      ).length
      if (peerCount > CROWDED_FLOOR_THRESHOLD) {
        setExpandedFloor((prev) => (prev === closest!.floor ? null : closest!.floor))
      }
      onSelectImp(BigInt(closest.id))
    }
  }

  return (
    <div ref={viewportRef} className="relative w-full h-full min-h-0 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onClick={handleClick}
        className="cursor-pointer block max-w-full max-h-full"
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated',
        }}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 text-sm text-zinc-400 z-20">
          Loading sprites…
        </div>
      )}
    </div>
  )
}
