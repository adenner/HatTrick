import { HatType, HAT_TYPE_COUNT, MAX_ANGLE_DEG, SHOOTER_X, SHOOTER_Y } from '../types'
import { Projectile } from './Projectile'

/**
 * Picks a random {@link HatType} with uniform probability.
 *
 * @returns A randomly selected hat type in the range [0, HAT_TYPE_COUNT).
 */
function randomHatType(): HatType {
  return Math.floor(Math.random() * HAT_TYPE_COUNT) as HatType
}

/**
 * Represents the player-controlled cannon at the bottom of the play field.
 *
 * The Shooter maintains a two-hat queue (current and next), tracks the
 * current aim angle, and is responsible for spawning {@link Projectile}
 * instances when the player fires. The position is fixed at the horizontal
 * centre of the canvas ({@link SHOOTER_X}, {@link SHOOTER_Y}) and does not
 * change during gameplay.
 *
 * Typical usage:
 * ```
 * const shooter = new Shooter()
 * shooter.aimAt(mouseX, mouseY)   // called each pointer-move event
 * const projectile = shooter.fire() // called on click / tap
 * ```
 */
export class Shooter {
  /**
   * Horizontal position of the cannon barrel's base, in px from the left
   * canvas edge. Fixed to {@link SHOOTER_X} for the lifetime of the instance.
   */
  readonly x: number = SHOOTER_X

  /**
   * Vertical position of the cannon barrel's base, in px from the top
   * canvas edge. Fixed to {@link SHOOTER_Y} for the lifetime of the instance.
   */
  readonly y: number = SHOOTER_Y

  /**
   * Current aim angle in degrees measured clockwise from straight up (0°).
   * Negative values point left of centre, positive values point right.
   * Clamped to the range [-{@link MAX_ANGLE_DEG}, +{@link MAX_ANGLE_DEG}].
   */
  angleDeg: number = 0

  /**
   * Hat type that will be launched on the next call to {@link fire}.
   * Shown in the cannon barrel in the HUD.
   */
  currentType: HatType

  /**
   * Hat type queued after {@link currentType}. Shown in the "next" preview
   * slot in the HUD. Becomes {@link currentType} once the player fires.
   */
  nextType: HatType

  /**
   * Creates a new Shooter with two randomly selected hat types pre-loaded
   * into the queue. No arguments are required; position constants are read
   * from {@link SHOOTER_X} and {@link SHOOTER_Y}.
   */
  constructor() {
    this.currentType = randomHatType()
    this.nextType = randomHatType()
  }

  /**
   * Updates {@link angleDeg} so the cannon points toward the given canvas
   * coordinates.
   *
   * The angle is derived via `atan2(dx, -dy)` which maps the standard
   * mathematical convention (0° = right) to a game convention where 0° is
   * straight up. When the cursor is at or below the shooter's Y position the
   * angle is clamped to ±{@link MAX_ANGLE_DEG} to prevent downward shots.
   *
   * @param mouseX - Pointer X coordinate in canvas-space px.
   * @param mouseY - Pointer Y coordinate in canvas-space px (increases downward).
   */
  aimAt(mouseX: number, mouseY: number): void {
    const dx = mouseX - this.x
    const dy = mouseY - this.y
    // atan2(dx, -dy) gives angle from up-axis (0° = straight up)
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI

    // If mouse is below the shooter, clamp to max angle
    if (dy >= 0) {
      angle = dx >= 0 ? MAX_ANGLE_DEG : -MAX_ANGLE_DEG
    } else {
      angle = Math.max(-MAX_ANGLE_DEG, Math.min(MAX_ANGLE_DEG, angle))
    }

    this.angleDeg = angle
  }

  /**
   * Fires the current hat and advances the internal queue.
   *
   * A new {@link Projectile} is created at the cannon's position travelling
   * in the direction of {@link angleDeg}. {@link currentType} is replaced by
   * {@link nextType} and a fresh random hat is drawn into {@link nextType}.
   *
   * @returns The newly spawned {@link Projectile} ready to be added to the
   *   game's active projectile list.
   */
  fire(): Projectile {
    const proj = new Projectile(this.x, this.y, this.angleDeg, this.currentType)
    this.currentType = this.nextType
    this.nextType = randomHatType()
    return proj
  }
}
