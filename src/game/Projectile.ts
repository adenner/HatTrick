import {
  HatType,
  GridPos,
  HAT_RADIUS,
  HAT_DIAMETER,
  PROJECTILE_SPEED,
  CANVAS_WIDTH,
} from '../types'
import { Grid } from './Grid'

export class Projectile {
  x: number
  y: number
  vx: number
  vy: number
  readonly type: HatType
  active: boolean = true

  constructor(x: number, y: number, angleDeg: number, type: HatType) {
    this.x = x
    this.y = y
    this.type = type
    const rad = (angleDeg * Math.PI) / 180
    this.vx = PROJECTILE_SPEED * Math.sin(rad)
    this.vy = -PROJECTILE_SPEED * Math.cos(rad)
  }

  update(): void {
    this.x += this.vx
    this.y += this.vy

    // Left wall bounce
    if (this.x - HAT_RADIUS < 0) {
      this.x = HAT_RADIUS
      this.vx = Math.abs(this.vx)
    }

    // Right wall bounce
    if (this.x + HAT_RADIUS > CANVAS_WIDTH) {
      this.x = CANVAS_WIDTH - HAT_RADIUS
      this.vx = -Math.abs(this.vx)
    }
  }

  hasHitCeiling(): boolean {
    return this.y - HAT_RADIUS <= 0
  }

  /** Returns the GridPos of the first hat hit, or null */
  hasHitHat(grid: Grid): GridPos | null {
    for (const hat of grid.iterHats()) {
      const { x: hx, y: hy } = grid.toPixel(hat.pos)
      if (Math.hypot(this.x - hx, this.y - hy) < HAT_DIAMETER) {
        return hat.pos
      }
    }
    return null
  }
}

/**
 * Compute aim line segments for the trajectory preview.
 * Returns an array of points forming the polyline (including start point).
 */
export function computeAimLine(
  startX: number,
  startY: number,
  angleDeg: number,
  canvasWidth: number,
  maxBounces = 4,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  const rad = (angleDeg * Math.PI) / 180
  let vx = Math.sin(rad)
  let vy = -Math.cos(rad)
  let x = startX
  let y = startY

  for (let bounce = 0; bounce < maxBounces && y > 0; bounce++) {
    // Time-to-left-wall
    const tLeft = vx < 0 ? (HAT_RADIUS - x) / vx : Infinity
    // Time-to-right-wall
    const tRight = vx > 0 ? (canvasWidth - HAT_RADIUS - x) / vx : Infinity
    // Time-to-ceiling
    const tCeil = vy < 0 ? (HAT_RADIUS - y) / vy : Infinity

    const t = Math.min(tLeft, tRight, tCeil)
    if (!isFinite(t) || t <= 0) break

    x += vx * t
    y += vy * t
    points.push({ x, y })

    if (y <= HAT_RADIUS) break  // hit ceiling

    // Bounce off wall
    vx = -vx
  }

  return points
}
