'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameSprites } from '@/hooks/useGameSprites'
import { useGameAnimation } from '@/context/GameAnimationContext'
import {
  BOARD_CANVAS_H,
  BOARD_CANVAS_W,
  BOARD_FLOOR_GAP,
  BOARD_PADDING_TOP,
  DIRECTION_ROW,
  DISPLAY_SIZE,
  FLOOR_MAX,
  FLOOR_MIN,
  PLATFORM_DRAW_H,
  PLATFORM_MAX_W,
  PLATFORM_MIN_W,
  PLATFORM_STRIP_SOURCES,
  PLATFORM_TILE_SIZE,
  SPRITE_SIZE,
  floorHalfWidth,
  floorWidth,
  laneBounds,
  shortAddress,
  tintFromAddress,
  yForLevel,
  type Direction,
  type ImpData,
} from '@/lib/gameUtils'

const CANVAS_W = BOARD_CANVAS_W
const PADDING_TOP = BOARD_PADDING_TOP
const FLOOR_GAP = BOARD_FLOOR_GAP
const MAX_PLATFORM_W = PLATFORM_MAX_W
const MIN_PLATFORM_W = PLATFORM_MIN_W
const FOOT_RATIO = 42 / SPRITE_SIZE
const CANVAS_H = BOARD_CANVAS_H
const CENTER_X = CANVAS_W / 2

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.5
const CROWDED_FLOOR_THRESHOLD = 4

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

export interface GameCanvasDisplayMetrics {
  displayHeight: number
  displayWidth: number
  fitScale: number
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
  const summitY = yForLevel(FLOOR_MAX, PADDING_TOP, FLOOR_GAP)
  const abyssY = yForLevel(FLOOR_MIN, PADDING_TOP, FLOOR_GAP)
  const midY = yForLevel(0, PADDING_TOP, FLOOR_GAP)

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

function drawIdBadge(
  ctx: CanvasRenderingContext2D,
  charX: number,
  charY: number,
  spriteSize: number,
  impId: string,
  owner: string,
  isSelected: boolean,
  isDead: boolean,
) {
  const label = isSelected ? `#${impId} ${shortAddress(owner)}` : `#${impId}`
  const labelX = charX + spriteSize / 2
  const labelY = charY - 5

  ctx.font = '9px monospace'
  ctx.textAlign = 'center'
  const metrics = ctx.measureText(label)
  const padX = 3
  const padY = 2
  const boxW = metrics.width + padX * 2
  const boxH = 11
  const boxX = labelX - boxW / 2
  const boxY = labelY - boxH + 2

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

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  fitScale: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  const contentW = CANVAS_W * fitScale * zoom
  const contentH = CANVAS_H * fitScale * zoom
  const maxX = Math.max(0, (contentW - viewportW) / 2)
  const maxY = Math.max(0, (contentH - viewportH) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  }
}

export function GameCanvas({
  imps,
  selectedImpId,
  onSelectImp,
  onDisplayMetrics,
}: {
  imps: ImpData[]
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
  onDisplayMetrics?: (metrics: GameCanvasDisplayMetrics) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const outlineRef = useRef<HTMLCanvasElement | null>(null)
  const entitiesRef = useRef<Map<string, CharacterEntity>>(new Map())
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const { sprites, ready } = useGameSprites()
  const { subscribe } = useGameAnimation()
  const [fitScale, setFitScale] = useState(2)
  const [userZoom, setUserZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [expandedFloor, setExpandedFloor] = useState<number | null>(null)
  const panRef = useRef(pan)
  const userZoomRef = useRef(userZoom)
  const fitScaleRef = useRef(fitScale)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const impsRef = useRef(imps)
  const selectedRef = useRef(selectedImpId)
  const expandedFloorRef = useRef(expandedFloor)

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    userZoomRef.current = userZoom
  }, [userZoom])

  useEffect(() => {
    fitScaleRef.current = fitScale
  }, [fitScale])

  useEffect(() => {
    impsRef.current = imps
    selectedRef.current = selectedImpId
    expandedFloorRef.current = expandedFloor
  }, [imps, selectedImpId, expandedFloor])

  const baseDisplayWidth = CANVAS_W * fitScale
  const baseDisplayHeight = CANVAS_H * fitScale
  const displayWidth = baseDisplayWidth * userZoom
  const displayHeight = baseDisplayHeight * userZoom

  useEffect(() => {
    onDisplayMetrics?.({ displayHeight: baseDisplayHeight, displayWidth: baseDisplayWidth, fitScale })
  }, [baseDisplayHeight, baseDisplayWidth, fitScale, onDisplayMetrics])

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

  const focusSelectedPepe = useCallback(() => {
    if (selectedRef.current === null) return
    const entity = entitiesRef.current.get(selectedRef.current.toString())
    const viewport = viewportRef.current
    if (!entity || !viewport) return

    const zoom = userZoomRef.current
    const scale = fitScaleRef.current * zoom
    const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
    const px = (CANVAS_W - pw) / 2
    const floorY = yForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
    const charX = px + entity.floorX * pw
    const charY = charYOnFloor(floorY, 0) + DISPLAY_SIZE / 2

    const targetZoom = Math.min(MAX_ZOOM, Math.max(1.5, zoom))
    setUserZoom(targetZoom)

    const contentW = CANVAS_W * fitScaleRef.current * targetZoom
    const contentH = CANVAS_H * fitScaleRef.current * targetZoom
    const screenX = (charX / CANVAS_W) * contentW
    const screenY = (charY / CANVAS_H) * contentH

    const nextPan = clampPan(
      {
        x: viewport.clientWidth / 2 - screenX,
        y: viewport.clientHeight / 2 - screenY,
      },
      targetZoom,
      fitScaleRef.current,
      viewport.clientWidth,
      viewport.clientHeight,
    )
    setPan(nextPan)
  }, [])

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

      const floorPeerCounts = new Map<number, number>()
      for (const entity of entitiesRef.current.values()) {
        const h = Math.round(entity.displayHeight)
        floorPeerCounts.set(h, (floorPeerCounts.get(h) ?? 0) + 1)
      }

      for (const entity of entitiesRef.current.values()) {
        entity.frameTimer += dt
        entity.animTimer += dt

        const floorHeight = Math.round(entity.displayHeight)
        const peerIds = peersOnFloor(entitiesRef.current, floorHeight)
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

      drawRhombusOutline(ctx)

      for (let level = FLOOR_MAX; level >= FLOOR_MIN; level--) {
        const y = yForLevel(level, PADDING_TOP, FLOOR_GAP)
        const pw = floorWidth(level, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = CENTER_X - pw / 2
        const isCenter = level === 0
        const isSummit = level === FLOOR_MAX
        const isAbyss = level === FLOOR_MIN

        const { tile, variant } = platformTileForLevel(level, sprites)
        drawPlatformStrip(ctx, tile, px, y, pw, variant)

        if (level <= -22) {
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

        ctx.fillStyle = borderColor
        ctx.fillRect(px, y + 3, pw, 1)

        if (isSummit || isAbyss || isCenter || level % 6 === 0) {
          ctx.font = '10px monospace'
          ctx.fillStyle = isSummit ? '#34d399' : isAbyss ? '#f87171' : isCenter ? '#fbbf24' : '#71717a'
          ctx.textAlign = 'right'
          ctx.fillText(level > 0 ? `+${level}` : `${level}`, px - 8, y + 6)
        }
      }

      const clusterLabels: { x: number; y: number; extra: number }[] = []

      const sorted = [...entitiesRef.current.values()].sort(
        (a, b) => a.displayHeight - b.displayHeight,
      )

      for (const entity of sorted) {
        const floorHeight = Math.round(entity.displayHeight)
        const peerCount = floorPeerCounts.get(floorHeight) ?? 1
        const crowded = peerCount > CROWDED_FLOOR_THRESHOLD
        const spriteSize = crowded ? DISPLAY_SIZE * 0.82 : DISPLAY_SIZE

        const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
        const px = CENTER_X - pw / 2
        const floorY = yForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
        const charX = px + entity.floorX * pw - spriteSize / 2
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
            spriteSize,
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
            spriteSize,
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
          ctx.strokeRect(charX + 0.5, charY + 0.5, spriteSize - 1, spriteSize - 1)
          ctx.shadowBlur = 0
        }

        drawIdBadge(
          ctx,
          charX,
          charY,
          spriteSize,
          entity.impId,
          entity.owner,
          entity.isSelected,
          entity.isDead,
        )

        if (crowded && peerCount > CROWDED_FLOOR_THRESHOLD) {
          const peerIds = peersOnFloor(entitiesRef.current, floorHeight)
          const sortedPeers = [...peerIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          if (sortedPeers[0] === entity.impId) {
            clusterLabels.push({
              x: px + pw / 2,
              y: floorY - 18,
              extra: peerCount - 3,
            })
          }
        }
      }

      for (const cluster of clusterLabels) {
        if (cluster.extra <= 0) continue
        const text = `+${cluster.extra}`
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        const tw = ctx.measureText(text).width + 8
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.fillRect(cluster.x - tw / 2, cluster.y - 8, tw, 12)
        ctx.fillStyle = '#fbbf24'
        ctx.fillText(text, cluster.x, cluster.y)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, sprites, syncEntities])

  useEffect(() => {
    const updateScale = () => {
      const container = viewportRef.current
      if (!container) return
      const fit = Math.min(container.clientWidth / CANVAS_W, 2.75)
      setFitScale(Math.max(1, fit))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setPan((prev) =>
      clampPan(prev, userZoom, fitScale, viewport.clientWidth, viewport.clientHeight),
    )
  }, [userZoom, fitScale])

  const canvasToLogical = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return null

    const rect = viewport.getBoundingClientRect()
    const scale = fitScaleRef.current * userZoomRef.current
    const contentW = CANVAS_W * scale
    const contentH = CANVAS_H * scale
    const offsetX = (viewport.clientWidth - contentW) / 2 + panRef.current.x
    const offsetY = (viewport.clientHeight - contentH) / 2 + panRef.current.y

    const localX = clientX - rect.left - offsetX
    const localY = clientY - rect.top - offsetY

    return { x: localX / scale, y: localY / scale }
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return
    const coords = canvasToLogical(e.clientX, e.clientY)
    if (!coords) return
    const { x, y } = coords

    let closest: { id: string; dist: number; floor: number } | null = null
    for (const entity of entitiesRef.current.values()) {
      const floorHeight = Math.round(entity.displayHeight)
      const peerCount = [...entitiesRef.current.values()].filter(
        (e) => Math.round(e.displayHeight) === floorHeight,
      ).length
      const crowded = peerCount > CROWDED_FLOOR_THRESHOLD
      const spriteSize = crowded ? DISPLAY_SIZE * 0.82 : DISPLAY_SIZE

      const pw = floorWidth(entity.displayHeight, MAX_PLATFORM_W, MIN_PLATFORM_W)
      const px = CENTER_X - pw / 2
      const floorY = yForLevel(entity.displayHeight, PADDING_TOP, FLOOR_GAP)
      const charX = px + entity.floorX * pw
      const charY = charYOnFloor(floorY, 0) + spriteSize / 2
      const dx = x - charX
      const dy = y - charY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < spriteSize * 0.65 && (!closest || dist < closest.dist)) {
        closest = { id: entity.impId, dist, floor: floorHeight }
      }
    }

    if (closest) {
      const peerCount = [...entitiesRef.current.values()].filter(
        (e) => Math.round(e.displayHeight) === closest!.floor,
      ).length
      if (peerCount > CROWDED_FLOOR_THRESHOLD) {
        setExpandedFloor((prev) => (prev === closest!.floor ? null : closest!.floor))
      }
      onSelectImp(BigInt(closest.id))
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setUserZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((z + delta) * 2) / 2)))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (userZoom <= 1) return
    isDraggingRef.current = false
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (userZoom <= 1) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingRef.current = true
    const viewport = viewportRef.current
    if (!viewport) return
    setPan(
      clampPan(
        {
          x: dragStartRef.current.panX + dx,
          y: dragStartRef.current.panY + dy,
        },
        userZoom,
        fitScale,
        viewport.clientWidth,
        viewport.clientHeight,
      ),
    )
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    viewportRef.current?.releasePointerCapture(e.pointerId)
    window.setTimeout(() => {
      isDraggingRef.current = false
    }, 0)
  }

  const zoomIn = () =>
    setUserZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 2) / 2))
  const zoomOut = () =>
    setUserZoom((z) => {
      const next = Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 2) / 2)
      if (next <= 1) setPan({ x: 0, y: 0 })
      return next
    })
  const resetView = () => {
    setUserZoom(1)
    setPan({ x: 0, y: 0 })
    setExpandedFloor(null)
  }

  return (
    <div className="relative w-full">
      <div
        ref={viewportRef}
        className="relative w-full overflow-hidden rounded-lg bg-zinc-950/40"
        style={{ height: baseDisplayHeight }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: displayWidth,
            height: displayHeight,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
            cursor: userZoom > 1 ? 'grab' : 'pointer',
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="block"
            style={{
              width: displayWidth,
              height: displayHeight,
              imageRendering: 'pixelated',
            }}
          />
        </div>

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 text-sm text-zinc-400 z-20">
            Loading sprites…
          </div>
        )}
      </div>

      <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={zoomOut}
          disabled={userZoom <= MIN_ZOOM}
          className="w-7 h-7 rounded bg-zinc-800/90 border border-zinc-700 text-zinc-200 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="px-1.5 text-xs font-mono text-zinc-400 min-w-[2.5rem] text-center">
          {userZoom.toFixed(1)}×
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={userZoom >= MAX_ZOOM}
          className="w-7 h-7 rounded bg-zinc-800/90 border border-zinc-700 text-zinc-200 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={resetView}
          className="h-7 px-2 rounded bg-zinc-800/90 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-700"
          title="Reset zoom and pan"
        >
          Reset
        </button>
        {selectedImpId !== null && (
          <button
            type="button"
            onClick={focusSelectedPepe}
            className="h-7 px-2 rounded bg-violet-900/60 border border-violet-700/50 text-violet-200 text-xs hover:bg-violet-800/60"
            title="Focus on selected Pepe"
          >
            Focus
          </button>
        )}
      </div>
    </div>
  )
}
