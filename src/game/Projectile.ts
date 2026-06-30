import {
  HatType,
  GridPos,
  HAT_RADIUS,
  HAT_DIAMETER,
  PROJECTILE_SPEED,
  CANVAS_WIDTH,
} from '../types'
import { Grid } from './Grid'

function angleToVelocity(angleDeg: number, speed = PROJECTILE_SPEED): { vx: number; vy: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { vx: speed * Math.sin(rad), vy: -speed * Math.cos(rad) }
}

/**
 * Represents a hat projectile fired by the player.
 *
 * A `Projectile` is created with an initial canvas position and a firing
 * angle, from which its per-frame velocity components are derived. Each call
 * to {@link update} advances the position by one frame and applies wall
 * bounce physics. When the projectile collides with a ceiling or an existing
 * hat it should be deactivated by the game loop and removed from play.
 *
 * The separate module-level functions {@link simulateLanding} and
 * {@link computeAimLine} run the same physics deterministically ahead of time
 * to power the targeting preview without mutating live game state.
 */
export class Projectile {
  /** Current x canvas pixel coordinate of the projectile's center. */
  x: number
  /** Current y canvas pixel coordinate of the projectile's center. */
  y: number
  /** Horizontal velocity in pixels per frame. Reverses sign on wall bounce. */
  vx: number
  /** Vertical velocity in pixels per frame. Negative means moving upward. */
  vy: number
  /** The hat type this projectile represents; determines color and match type. */
  readonly type: HatType
  /**
   * Whether the projectile is still in flight. The game loop should remove
   * or ignore this projectile once `active` becomes `false`.
   */
  active: boolean = true

  /**
   * Creates a new `Projectile` aimed at the given angle from the given position.
   *
   * The angle is measured in degrees from straight up (0°), clockwise: 90°
   * fires directly right, -90° fires directly left.  Velocity components are
   * derived from the angle using:
   * - `vx = PROJECTILE_SPEED * sin(angleDeg)`
   * - `vy = -PROJECTILE_SPEED * cos(angleDeg)` (negative because Y increases downward)
   *
   * @param x        - Starting x canvas pixel coordinate (typically the cannon center).
   * @param y        - Starting y canvas pixel coordinate (typically the cannon center).
   * @param angleDeg - Fire angle in degrees, measured clockwise from straight up.
   * @param type     - The `HatType` this projectile carries.
   */
  constructor(x: number, y: number, angleDeg: number, type: HatType) {
    this.x = x
    this.y = y
    this.type = type
    const { vx, vy } = angleToVelocity(angleDeg)
    this.vx = vx
    this.vy = vy
  }

  /**
   * Advances the projectile by one frame, applying wall bounce physics.
   *
   * Moves the projectile by `(vx, vy)`, then checks whether it has hit the
   * left or right wall of the canvas. On a wall hit the relevant velocity
   * component is reflected and the position is clamped so the projectile does
   * not clip outside the canvas.
   *
   * @returns `true` if the projectile bounced off a wall this frame,
   *   `false` if it continued in a straight line.
   */
  update(): boolean {
    this.x += this.vx
    this.y += this.vy

    let bounced = false

    // Left wall bounce
    if (this.x - HAT_RADIUS < 0) {
      this.x = HAT_RADIUS
      this.vx = Math.abs(this.vx)
      bounced = true
    }

    // Right wall bounce
    if (this.x + HAT_RADIUS > CANVAS_WIDTH) {
      this.x = CANVAS_WIDTH - HAT_RADIUS
      this.vx = -Math.abs(this.vx)
      bounced = true
    }

    return bounced
  }

  /**
   * Returns `true` if the projectile's top edge has reached or passed the
   * ceiling (y = 0). When this is the case the game loop should land the hat
   * at the ceiling row rather than continuing flight.
   *
   * @returns `true` when the projectile has hit the ceiling, `false` otherwise.
   */
  hasHitCeiling(): boolean {
    return this.y - HAT_RADIUS <= 0
  }

  /**
   * Tests whether the projectile overlaps with any hat currently on the grid.
   *
   * Collision is determined by comparing the Euclidean distance between the
   * projectile center and each hat's pixel center against `HAT_DIAMETER` (i.e.,
   * the two circles are touching when centers are one diameter apart).
   *
   * @param grid - The active game grid to test against.
   * @returns The `GridPos` of the first hat whose bounding circle overlaps
   *   the projectile, or `null` if no collision was detected.
   */
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
 * Steps through projectile physics ahead of time to determine where a fired
 * hat would land on the grid.
 *
 * Uses the exact same collision and bounce logic as the live game loop so
 * that the predicted landing cell always matches the real one. The simulation
 * is capped at `MAX_STEPS` (600) frames to avoid infinite loops when the
 * trajectory is nearly horizontal.
 *
 * @param startX      - The x canvas pixel coordinate from which the hat is fired.
 * @param startY      - The y canvas pixel coordinate from which the hat is fired.
 * @param angleDeg    - Fire angle in degrees, measured clockwise from straight up.
 * @param grid        - The current game grid used for hat-collision checks.
 * @param canvasWidth - The pixel width of the canvas, used for wall bounce bounds.
 * @returns The `GridPos` of the cell where the hat would land, or `null` if no
 *   landing cell was found within the step limit (e.g., angle nearly horizontal).
 */
export function simulateLanding(
  startX: number,
  startY: number,
  angleDeg: number,
  grid: Grid,
  canvasWidth: number,
): GridPos | null {
  let x = startX
  let y = startY
  let { vx, vy } = angleToVelocity(angleDeg)
  const MAX_STEPS = 600

  for (let i = 0; i < MAX_STEPS; i++) {
    x += vx
    y += vy

    // Wall bounces
    if (x - HAT_RADIUS < 0) { x = HAT_RADIUS; vx = Math.abs(vx) }
    if (x + HAT_RADIUS > canvasWidth) { x = canvasWidth - HAT_RADIUS; vx = -Math.abs(vx) }

    // Hat collision — only check hats within 2 rows vertically for speed
    for (const hat of grid.iterHats()) {
      const { x: hx, y: hy } = grid.toPixel(hat.pos)
      if (Math.abs(hy - y) > HAT_DIAMETER) continue
      if (Math.hypot(x - hx, y - hy) < HAT_DIAMETER) {
        return grid.findLandingCell(hat.pos, x, y)
      }
    }

    // Ceiling collision
    if (y - HAT_RADIUS <= 0) {
      return grid.snapToGrid(x, HAT_RADIUS)
    }
  }

  return null
}

/**
 * Computes the vertices of the trajectory preview line for a given firing angle.
 *
 * The trajectory is calculated analytically rather than by stepping frame-by-
 * frame: for each segment the time-to-wall and time-to-ceiling are compared and
 * the earliest event determines the next vertex. This is fast enough to run
 * every frame and produces a smooth polyline regardless of `PROJECTILE_SPEED`.
 *
 * The returned array always begins with `{x: startX, y: startY}`. Each
 * subsequent point is either a wall-bounce corner or the ceiling hit point. The
 * line ends when the ceiling is reached or `maxBounces` wall bounces have
 * occurred.
 *
 * Note: this function does not account for hat collisions — it shows the
 * geometrically ideal path. Use {@link simulateLanding} for the actual landing
 * position indicator.
 *
 * @param startX      - The x canvas pixel coordinate of the firing origin.
 * @param startY      - The y canvas pixel coordinate of the firing origin.
 * @param angleDeg    - Fire angle in degrees, measured clockwise from straight up.
 * @param canvasWidth - The pixel width of the canvas, used for wall bounce bounds.
 * @param maxBounces  - Maximum number of wall bounces to trace before stopping.
 *   Defaults to `4`.
 * @returns An array of `{x, y}` points forming the aim-line polyline,
 *   starting from the firing origin.
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

  for (let bounce = 0; bounce < maxBounces; bounce++) {
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
