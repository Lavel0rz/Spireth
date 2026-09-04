export const FLOOR_MIN = -25
export const FLOOR_MAX = 25
export const SPRITE_SIZE = 48
export const FRAME_COLS = 4

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

export function tintFromAddress(address: string): [number, number, number] {
  const hex = address.slice(2).padEnd(6, '0')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return [
    120 + (r % 100),
    150 + (g % 80),
    110 + (b % 90),
  ]
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
