import { HatType, HAT_TYPE_COUNT, MAX_ANGLE_DEG, SHOOTER_X, SHOOTER_Y } from '../types'
import { Projectile } from './Projectile'

/** All valid hat types as a constant pool for fallback selection. */
const ALL_HAT_TYPES: readonly HatType[] = Array.from(
  { length: HAT_TYPE_COUNT },
  (_, i) => i as HatType,
)

/**
 * Picks a random {@link HatType} from the supplied pool with uniform probability.
 *
 * @param pool - The set of allowed hat types to draw from.
 * @returns A randomly selected hat type from `pool`.
 */
function randomHatType(pool: readonly HatType[]): HatType {
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Represents the player-controlled cannon at the bottom of the play field.
 *
 * The Shooter maintains a two-hat queue (current and next), an optional hold
 * slot, tracks the current aim angle, and is responsible for spawning
 * {@link Projectile} instances when the player fires.
 */
export class Shooter {
  readonly x: number = SHOOTER_X
  readonly y: number = SHOOTER_Y

  /** Current aim angle in degrees measured clockwise from straight up (0°). */
  angleDeg: number = 0

  /** Hat type that will be launched on the next call to {@link fire}. */
  currentType: HatType

  /** Hat type queued after {@link currentType}. */
  nextType: HatType

  /** Hat stashed in the hold slot, or `null` when the slot is empty. */
  holdType: HatType | null = null

  /**
   * The subset of hat types that may appear in the queue.
   * Defaults to all types; updated by {@link setTypePool}.
   */
  private typePool: readonly HatType[] = ALL_HAT_TYPES

  constructor() {
    this.currentType = randomHatType(ALL_HAT_TYPES)
    this.nextType = randomHatType(ALL_HAT_TYPES)
  }

  /**
   * Restricts future queue draws to the supplied hat types.
   *
   * If `pool` is empty the restriction is removed and all types are allowed.
   * If {@link nextType} is no longer in the new pool it is immediately re-drawn.
   *
   * @param pool - Hat types that may appear in future queue draws.
   */
  setTypePool(pool: HatType[]): void {
    this.typePool = pool.length > 0 ? pool : ALL_HAT_TYPES
    if (!this.typePool.includes(this.nextType)) {
      this.nextType = randomHatType(this.typePool)
    }
  }

  /**
   * Updates {@link angleDeg} so the cannon points toward the given canvas coordinates.
   *
   * @param mouseX - Pointer X coordinate in canvas-space px.
   * @param mouseY - Pointer Y coordinate in canvas-space px (increases downward).
   */
  aimAt(mouseX: number, mouseY: number): void {
    const dx = mouseX - this.x
    const dy = mouseY - this.y
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI

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
   * @returns The newly spawned {@link Projectile}.
   */
  fire(): Projectile {
    const proj = new Projectile(this.x, this.y, this.angleDeg, this.currentType)
    this.currentType = this.nextType
    this.nextType = randomHatType(this.typePool)
    return proj
  }

  /**
   * Activates the hold/swap mechanic.
   *
   * - **First press** (hold slot empty): stashes {@link currentType} and advances the queue.
   * - **Subsequent presses**: swaps {@link currentType} with {@link holdType}.
   */
  hold(): void {
    if (this.holdType === null) {
      this.holdType = this.currentType
      this.currentType = this.nextType
      this.nextType = randomHatType(this.typePool)
    } else {
      const tmp = this.currentType
      this.currentType = this.holdType
      this.holdType = tmp
    }
  }
}
