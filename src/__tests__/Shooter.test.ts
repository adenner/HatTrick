import { describe, it, expect } from 'vitest'
import { Shooter } from '../game/Shooter'
import { MAX_ANGLE_DEG, SHOOTER_X, SHOOTER_Y } from '../types'

describe('Shooter', () => {
  describe('aimAt', () => {
    it('angle is 0 when mouse is directly above shooter', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X, SHOOTER_Y - 100)
      expect(s.angleDeg).toBeCloseTo(0)
    })

    it('positive angle when mouse is to the right', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X + 100, SHOOTER_Y - 100)
      expect(s.angleDeg).toBeGreaterThan(0)
    })

    it('negative angle when mouse is to the left', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X - 100, SHOOTER_Y - 100)
      expect(s.angleDeg).toBeLessThan(0)
    })

    it('clamps to MAX_ANGLE_DEG when mouse is far right', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X + 10000, SHOOTER_Y - 1)
      expect(s.angleDeg).toBe(MAX_ANGLE_DEG)
    })

    it('clamps to -MAX_ANGLE_DEG when mouse is far left', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X - 10000, SHOOTER_Y - 1)
      expect(s.angleDeg).toBe(-MAX_ANGLE_DEG)
    })

    it('clamps to MAX_ANGLE_DEG when mouse is directly below', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X + 10, SHOOTER_Y + 100)
      expect(s.angleDeg).toBe(MAX_ANGLE_DEG)
    })

    it('does not exceed ±MAX_ANGLE_DEG', () => {
      const s = new Shooter()
      const mousePositions = [
        [0, 0], [SHOOTER_X * 2, 0], [SHOOTER_X, 0],
        [0, SHOOTER_Y], [SHOOTER_X * 2, SHOOTER_Y],
      ]
      for (const [mx, my] of mousePositions) {
        s.aimAt(mx, my)
        expect(Math.abs(s.angleDeg)).toBeLessThanOrEqual(MAX_ANGLE_DEG)
      }
    })
  })

  describe('fire', () => {
    it('creates a projectile at shooter position', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X, SHOOTER_Y - 100)
      const proj = s.fire()
      expect(proj.x).toBe(s.x)
      expect(proj.y).toBe(s.y)
    })

    it('advances hat queue after firing', () => {
      const s = new Shooter()
      const originalNext = s.nextType
      s.fire()
      expect(s.currentType).toBe(originalNext)
    })

    it('generates a new nextType after firing', () => {
      // This is probabilistic, but after many fires the types should vary
      const s = new Shooter()
      const types = new Set<number>()
      for (let i = 0; i < 50; i++) {
        types.add(s.nextType)
        s.fire()
      }
      // Should have seen more than 1 type over 50 fires
      expect(types.size).toBeGreaterThan(1)
    })

    it('projectile has correct type from queue', () => {
      const s = new Shooter()
      const expectedType = s.currentType
      const proj = s.fire()
      expect(proj.type).toBe(expectedType)
    })
  })

  describe('fired projectile velocity', () => {
    it('straight up gives vx≈0', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X, SHOOTER_Y - 100)
      const proj = s.fire()
      expect(proj.vx).toBeCloseTo(0, 3)
      expect(proj.vy).toBeLessThan(0)
    })

    it('45° right: vx ≈ vy magnitude', () => {
      const s = new Shooter()
      s.angleDeg = 45
      const proj = s.fire()
      expect(proj.vx).toBeCloseTo(proj.vy * -1, 3)
    })
  })
})
