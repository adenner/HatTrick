import { describe, it, expect } from 'vitest'
import { Shooter } from '../game/Shooter'
import { HatType, MAX_ANGLE_DEG, SHOOTER_X, SHOOTER_Y } from '../types'

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

    it('clamps to MAX_ANGLE_DEG when mouse is exactly at shooter Y (dy=0, dx>0)', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X + 50, SHOOTER_Y)
      expect(s.angleDeg).toBe(MAX_ANGLE_DEG)
    })

    it('clamps to -MAX_ANGLE_DEG when mouse is exactly at shooter Y (dy=0, dx<0)', () => {
      const s = new Shooter()
      s.aimAt(SHOOTER_X - 50, SHOOTER_Y)
      expect(s.angleDeg).toBe(-MAX_ANGLE_DEG)
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
      const s = new Shooter()
      const types = new Set<number>()
      for (let i = 0; i < 50; i++) {
        types.add(s.nextType)
        s.fire()
      }
      expect(types.size).toBeGreaterThan(1)
    })

    it('projectile has correct type from queue', () => {
      const s = new Shooter()
      const expectedType = s.currentType
      const proj = s.fire()
      expect(proj.type).toBe(expectedType)
    })
  })

  describe('hold / swap', () => {
    it('hold is null on a fresh shooter', () => {
      const s = new Shooter()
      expect(s.holdType).toBeNull()
    })

    it('first hold stashes current and advances queue', () => {
      const s = new Shooter()
      const original = s.currentType
      const nextBefore = s.nextType
      s.hold()
      expect(s.holdType).toBe(original)
      expect(s.currentType).toBe(nextBefore)
    })

    it('second hold swaps current with hold, leaves nextType unchanged', () => {
      const s = new Shooter()
      s.hold()
      const heldType = s.holdType!
      const currentAfterHold = s.currentType
      const nextBeforeSwap = s.nextType
      s.hold()
      expect(s.currentType).toBe(heldType)
      expect(s.holdType).toBe(currentAfterHold)
      expect(s.nextType).toBe(nextBeforeSwap)
    })

    it('repeated holds toggle between two types', () => {
      const s = new Shooter()
      s.hold()
      const a = s.currentType
      const b = s.holdType!
      s.hold()
      expect(s.currentType).toBe(b)
      expect(s.holdType).toBe(a)
      s.hold()
      expect(s.currentType).toBe(a)
      expect(s.holdType).toBe(b)
    })
  })

  describe('setTypePool', () => {
    it('restricts future nextType draws to the provided pool', () => {
      const s = new Shooter()
      s.setTypePool([HatType.WITCH])
      for (let i = 0; i < 20; i++) {
        s.fire()
        expect(s.nextType).toBe(HatType.WITCH)
      }
    })

    it('re-seeds nextType if it is no longer in the pool', () => {
      const s = new Shooter()
      s.nextType = HatType.FEDORA
      s.setTypePool([HatType.WITCH, HatType.COWBOY])
      expect(s.nextType).not.toBe(HatType.FEDORA)
    })

    it('falls back to all types when given an empty pool', () => {
      const s = new Shooter()
      s.setTypePool([])
      const types = new Set<number>()
      for (let i = 0; i < 50; i++) {
        s.fire()
        types.add(s.nextType)
      }
      expect(types.size).toBeGreaterThan(1)
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
