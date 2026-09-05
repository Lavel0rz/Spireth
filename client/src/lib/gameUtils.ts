export const FLOOR_MIN = -50
export const FLOOR_MAX = 50
/** pet.game Pepe sheet cell size (336×44, 14 cols × 2 rows, black bg). */
export const FRAME_W = 24
export const FRAME_H = 22
/** Canvas draw height for one Pepe (preserves 24:22 aspect via DISPLAY_WIDTH). */
export const DISPLAY_HEIGHT = 20
export const DISPLAY_SCALE = DISPLAY_HEIGHT / FRAME_H
export const DISPLAY_WIDTH = FRAME_W * DISPLAY_SCALE
/** Source-pixel Y where feet meet the ground (for platform alignment). */
export const FRAME_FOOT_Y = 20

/**
 * Pepe frame map (col, row) on the pet.game sheet (14 cols × 2 rows):
 * - Row 0: front idle/walk 0–3, talk/expressions 4–11, squat/dead 12–13
 * - Row 1: side walk 0–3 (mirror for left), jump stride 6–7, back 8–9, empty 12–13
 */
export interface PepeFrame {
  col: number
  row: number
  flipX?: boolean
}

const WALK_FRONT_COLS = [0, 1, 2, 3]
/** Skip col 0 — side profile is very narrow in-cell; cols 1–3 read clearer on the board. */
const WALK_SIDE_COLS = [1, 2, 3, 2]
const JUMP_SIDE_COLS = [1, 2]
const REVEAL_COLS = [0, 2]

export function pepeWalkFrame(facing: Direction, frame: number): PepeFrame {
  const f = frame % 4
  switch (facing) {
    case 'down':
      return { col: WALK_FRONT_COLS[f], row: 0 }
    case 'up':
      return { col: 8 + (f % 2), row: 1 }
    case 'right':
      return { col: WALK_SIDE_COLS[f], row: 1 }
    case 'left':
      return { col: WALK_SIDE_COLS[f], row: 1, flipX: true }
  }
}

export function pepeJumpFrame(facing: Direction, frame: number): PepeFrame {
  switch (facing) {
    case 'up':
      return { col: 8, row: 1 }
    case 'down':
      return { col: 2, row: 0 }
    case 'right':
      return { col: JUMP_SIDE_COLS[frame % 2], row: 1 }
    case 'left':
      return { col: JUMP_SIDE_COLS[frame % 2], row: 1, flipX: true }
  }
}

export function pepeCommitFrame(timerMs: number): PepeFrame {
  return { col: timerMs < 250 ? 9 : 4, row: 0 }
}

export function pepeRevealFrame(timerMs: number): PepeFrame {
  return { col: REVEAL_COLS[Math.floor(timerMs / 120) % 2], row: 0 }
}

export function pepeDeadFrame(): PepeFrame {
  return { col: 12, row: 0 }
}

export type PepeAnimState = 'walk' | 'commit' | 'revealPending' | 'jump' | 'dead'

/**
 * Shared Pepe body frame for sim and live boards.
 * Walk/jump/dead sprites only — commit/reveal-pending keep motion but use walk art
 * (sim never shows expression frames; live matches that look).
 */
export function resolvePepeFrame(
  animState: PepeAnimState,
  facing: Direction,
  frame: number,
  isDead: boolean,
): PepeFrame {
  if (isDead) return pepeDeadFrame()
  if (animState === 'jump') return pepeJumpFrame(facing, frame)
  return pepeWalkFrame(facing, frame)
}

export const PLATFORM_TILE_SIZE = 48
export const PLATFORM_TILE_SRC_Y = 64
export const PLATFORM_TILE_SRC_H = 16
export const PLATFORM_DRAW_H = 14

/** Rhombus platform width at center (level 0) and tips (±50). */
export const PLATFORM_MAX_W = 360
export const PLATFORM_MIN_W = 20

export const PLATFORM_STRIP_SOURCES = {
  grass: { sx: 0, sy: PLATFORM_TILE_SRC_Y, sw: PLATFORM_TILE_SIZE, sh: PLATFORM_TILE_SRC_H },
  stone: { sx: 80, sy: 0, sw: 48, sh: 16 },
  /** Flat bottom-row strip — not the hill silhouette at (0,0). */
  hills: { sx: 0, sy: 80, sw: 48, sh: 16 },
} as const

export type Direction = 'down' | 'up' | 'left' | 'right'

export interface ImpData {
  id: bigint
  height: number
  isDead: boolean
  owner: string
}

/** Continuous rhombus half-width taper (float, sub-pixel friendly). */
export function floorWidth(level: number, maxWidth: number, minWidth: number): number {
  const t = Math.min(1, Math.abs(level) / FLOOR_MAX)
  return maxWidth - t * (maxWidth - minWidth)
}

export function floorHalfWidth(level: number, maxWidth: number, minWidth: number): number {
  return floorWidth(level, maxWidth, minWidth) / 2
}

/** Board layout constants shared by Board meter + GameCanvas. */
export const BOARD_CANVAS_W = 440
export const BOARD_PADDING_TOP = 28
/** Vertical spacing between floors — tuned so 101 levels fit fullscreen when scaled. */
export const BOARD_FLOOR_GAP = 6
export const BOARD_CANVAS_H =
  BOARD_PADDING_TOP + (FLOOR_MAX - FLOOR_MIN) * BOARD_FLOOR_GAP + 40

/** Show summit/abyss/0 and every 10th floor so labels stay readable. */
export function shouldShowFloorLabel(level: number): boolean {
  return (
    level === FLOOR_MAX ||
    level === FLOOR_MIN ||
    level === 0 ||
    level % 10 === 0
  )
}

export const RHOMBUS_SUMMIT_Y = BOARD_PADDING_TOP
export const RHOMBUS_ABYSS_Y = yForLevel(FLOOR_MIN, BOARD_PADDING_TOP, BOARD_FLOOR_GAP)

export function rhombusYFraction(y: number): number {
  return y / BOARD_CANVAS_H
}

export function yForLevel(level: number, paddingTop: number, floorGap: number): number {
  return paddingTop + (FLOOR_MAX - level) * floorGap
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

/** Distinct saturated hues biased away from grass-green for readable pepe tints. */
export function tintFromAddress(address: string): [number, number, number] {
  const hex = address.slice(2).padEnd(8, '0')
  const hash = parseInt(hex.slice(0, 8), 16)
  let hue = hash % 360
  if (hue >= 75 && hue <= 155) hue = (hue + 140) % 360
  return hslToRgb(hue, 0.78, 0.52)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Duration of a single smooth floor jump (ms), shared by canvas + sim height sync. */
export function jumpDurationMs(from: number, to: number): number {
  const delta = Math.abs(to - from)
  if (delta === 0) return 0
  return 280 + delta * 80
}

export interface LaneBounds {
  min: number
  max: number
  center: number
}

/** Stable horizontal lane for an imp among peers on the same floor (0–1 fractions). */
export function laneBounds(impId: string, peerIds: string[], expanded = false): LaneBounds {
  const sorted = [...peerIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  const idx = sorted.indexOf(impId)
  const count = sorted.length

  if (count <= 1) {
    return { min: 0.14, max: 0.86, center: 0.5 }
  }

  const usable = expanded ? 0.9 : 0.72
  const laneW = usable / count
  const start = expanded ? 0.05 : 0.14
  const center = start + laneW * idx + laneW / 2
  const padding = laneW * (expanded ? 0.12 : 0.22)

  return {
    min: center - laneW / 2 + padding,
    max: center + laneW / 2 - padding,
    center,
  }
}
