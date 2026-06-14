export const enum HatType {
  TOP_HAT = 0,
  FEDORA = 1,
  COWBOY = 2,
  WITCH = 3,
  BASEBALL_CAP = 4,
  BERET = 5,
  PROPELLER = 6,
}

export const HAT_TYPE_COUNT = 7

export type GamePhase = 'menu' | 'playing' | 'paused' | 'won' | 'lost'

export interface GridPos {
  row: number
  col: number
}

export interface GridHat {
  type: HatType
  pos: GridPos
}

export interface FallingHat {
  type: HatType
  x: number
  y: number
  vx: number
  vy: number
  opacity: number
}

// Canvas dimensions
export const CANVAS_WIDTH = 600
export const CANVAS_HEIGHT = 700

// Hat sizing
export const HAT_RADIUS = 24
export const HAT_DIAMETER = HAT_RADIUS * 2

// Grid layout
export const GRID_COLS = 13
// Vertical distance between row centers in a hex grid
export const ROW_HEIGHT = Math.round(HAT_DIAMETER * 0.866) // sin(60°) ≈ 41.6

// Gameplay
export const PROJECTILE_SPEED = 8
export const DANGER_ROW_Y = CANVAS_HEIGHT - 130
export const SHOOTER_X = CANVAS_WIDTH / 2
export const SHOOTER_Y = CANVAS_HEIGHT - 55
export const MAX_ANGLE_DEG = 78
export const MIN_MATCH_COUNT = 3
export const INITIAL_ROWS = 8
