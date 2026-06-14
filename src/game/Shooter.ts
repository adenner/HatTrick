import { HatType, HAT_TYPE_COUNT, MAX_ANGLE_DEG, SHOOTER_X, SHOOTER_Y } from '../types'
import { Projectile } from './Projectile'

function randomHatType(): HatType {
  return Math.floor(Math.random() * HAT_TYPE_COUNT) as HatType
}

export class Shooter {
  readonly x: number = SHOOTER_X
  readonly y: number = SHOOTER_Y
  angleDeg: number = 0
  currentType: HatType
  nextType: HatType

  constructor() {
    this.currentType = randomHatType()
    this.nextType = randomHatType()
  }

  /** Update aim angle from mouse/touch canvas coordinates */
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

  /** Fire the current hat and advance the queue */
  fire(): Projectile {
    const proj = new Projectile(this.x, this.y, this.angleDeg, this.currentType)
    this.currentType = this.nextType
    this.nextType = randomHatType()
    return proj
  }


}
