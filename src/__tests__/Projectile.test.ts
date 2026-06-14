import { describe, it, expect } from 'vitest'
import { Projectile, computeAimLine } from '../game/Projectile'
import { Grid } from '../game/Grid'
import { HatType, HAT_RADIUS, CANVAS_WIDTH } from '../types'

describe('Projectile', () => {
  describe('constructor velocity', () => {
    it('angle 0 produces straight upward velocity', () => {
      const p = new Projectile(300, 600, 0, HatType.FEDORA)
      expect(p.vx).toBeCloseTo(0)
      expect(p.vy).toBeLessThan(0)
    })

    it('positive angle tilts right', () => {
      const p = new Projectile(300, 600, 45, HatType.FEDORA)
      expect(p.vx).toBeGreaterThan(0)
      expect(p.vy).toBeLessThan(0)
    })

    it('negative angle tilts left', () => {
      const p = new Projectile(300, 600, -45, HatType.FEDORA)
      expect(p.vx).toBeLessThan(0)
      expect(p.vy).toBeLessThan(0)
    })
  })

  describe('wall bouncing', () => {
    it('bounces off left wall: vx becomes positive', () => {
      const p = new Projectile(HAT_RADIUS + 1, 300, -45, HatType.TOP_HAT)
      const initialVx = p.vx // negative
      // Force it into the left wall
      p.x = HAT_RADIUS - 5
      p.update()
      expect(p.vx).toBeGreaterThan(0)
      expect(p.vx).toBeCloseTo(Math.abs(initialVx))
    })

    it('bounces off right wall: vx becomes negative', () => {
      const p = new Projectile(CANVAS_WIDTH - HAT_RADIUS - 1, 300, 45, HatType.TOP_HAT)
      const initialVx = p.vx // positive
      p.x = CANVAS_WIDTH - HAT_RADIUS + 5
      p.update()
      expect(p.vx).toBeLessThan(0)
      expect(p.vx).toBeCloseTo(-Math.abs(initialVx))
    })

    it('x stays within bounds after left bounce', () => {
      const p = new Projectile(HAT_RADIUS, 300, -80, HatType.FEDORA)
      for (let i = 0; i < 20; i++) p.update()
      expect(p.x).toBeGreaterThanOrEqual(HAT_RADIUS)
      expect(p.x).toBeLessThanOrEqual(CANVAS_WIDTH - HAT_RADIUS)
    })
  })

  describe('hasHitCeiling', () => {
    it('false when y is well below ceiling', () => {
      const p = new Projectile(300, 400, 0, HatType.WITCH)
      expect(p.hasHitCeiling()).toBe(false)
    })

    it('true when y - radius <= 0', () => {
      const p = new Projectile(300, HAT_RADIUS - 1, 0, HatType.WITCH)
      expect(p.hasHitCeiling()).toBe(true)
    })
  })

  describe('hasHitHat', () => {
    it('returns null when grid is empty', () => {
      const grid = new Grid()
      const p = new Projectile(100, 100, 0, HatType.BERET)
      expect(p.hasHitHat(grid)).toBeNull()
    })

    it('returns GridPos when close enough to a hat', () => {
      const grid = new Grid()
      grid.setHat({ row: 2, col: 3 }, HatType.COWBOY)
      const { x, y } = grid.toPixel({ row: 2, col: 3 })
      // Place projectile just inside collision radius
      const p = new Projectile(x + HAT_RADIUS - 2, y, 0, HatType.BERET)
      const hit = p.hasHitHat(grid)
      expect(hit).not.toBeNull()
      expect(hit?.row).toBe(2)
      expect(hit?.col).toBe(3)
    })

    it('returns null when outside collision radius', () => {
      const grid = new Grid()
      grid.setHat({ row: 2, col: 3 }, HatType.COWBOY)
      const { x, y } = grid.toPixel({ row: 2, col: 3 })
      const p = new Projectile(x + HAT_RADIUS * 2 + 5, y, 0, HatType.BERET)
      expect(p.hasHitHat(grid)).toBeNull()
    })
  })

  describe('trajectory over frames', () => {
    it('moves upward each frame for straight shot', () => {
      const p = new Projectile(300, 600, 0, HatType.TOP_HAT)
      const y0 = p.y
      p.update()
      expect(p.y).toBeLessThan(y0)
    })

    it('y decreases monotonically straight up', () => {
      const p = new Projectile(300, 600, 0, HatType.TOP_HAT)
      let prevY = p.y
      for (let i = 0; i < 10; i++) {
        p.update()
        expect(p.y).toBeLessThan(prevY)
        prevY = p.y
      }
    })
  })
})

describe('computeAimLine', () => {
  it('starts at given coordinates', () => {
    const pts = computeAimLine(300, 600, 0, CANVAS_WIDTH)
    expect(pts[0].x).toBe(300)
    expect(pts[0].y).toBe(600)
  })

  it('terminates at ceiling for straight-up shot', () => {
    const pts = computeAimLine(300, 600, 0, CANVAS_WIDTH)
    const last = pts[pts.length - 1]
    expect(last.y).toBeLessThanOrEqual(HAT_RADIUS)
  })

  it('produces wall bounce points for angled shot', () => {
    const pts = computeAimLine(300, 600, 60, CANVAS_WIDTH, 4)
    expect(pts.length).toBeGreaterThan(2) // at least start + bounce + end
  })

  it('never exceeds canvas bounds', () => {
    const pts = computeAimLine(300, 600, 70, CANVAS_WIDTH, 6)
    expect(pts.every(p => p.x >= 0 && p.x <= CANVAS_WIDTH)).toBe(true)
  })
})
