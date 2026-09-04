export const FLOOR_MIN = -25
export const FLOOR_MAX = 25
export const SPRITE_SIZE = 48
export const DISPLAY_SIZE = 28
export const FRAME_COLS = 4

export const PLATFORM_TILE_SIZE = 48
export const PLATFORM_TILE_SRC_Y = 64
export const PLATFORM_TILE_SRC_H = 16
export const PLATFORM_DRAW_H = 14

export type Direction = 'down' | 'up' | 'left' | 'right'

export const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 3,
}

export interface ImpData {
  id: bigint
  height: number
  isDead: boolean
  owner: string
}

export function floorWidth(level: number, maxWidth: number, minWidth: number): number {
  const absLevel = Math.abs(level)
  return maxWidth - absLevel * ((maxWidth - minWidth) / 25)
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

export interface LaneBounds {
  min: number
  max: number
  center: number
}

/** Stable horizontal lane for an imp among peers on the same floor (0–1 fractions). */
export function laneBounds(impId: string, peerIds: string[]): LaneBounds {
  const sorted = [...peerIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  const idx = sorted.indexOf(impId)
  const count = sorted.length

  if (count <= 1) {
    return { min: 0.14, max: 0.86, center: 0.5 }
  }

  const usable = 0.72
  const laneW = usable / count
  const start = 0.14
  const center = start + laneW * idx + laneW / 2
  const padding = laneW * 0.22

  return {
    min: center - laneW / 2 + padding,
    max: center + laneW / 2 - padding,
    center,
  }
}
