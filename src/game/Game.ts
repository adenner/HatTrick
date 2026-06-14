import {
  GamePhase,
  FallingHat,
  GridPos,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HAT_RADIUS,
  DANGER_ROW_Y,
  INITIAL_ROWS,
  MIN_MATCH_COUNT,
} from '../types'
import { Grid } from './Grid'
import { Shooter } from './Shooter'
import { Projectile, simulateLanding } from './Projectile'
import { calculateShotScore } from './scoring'
import { HatRenderer } from '../render/HatRenderer'
import { Renderer, RenderState } from '../render/Renderer'
import { InputHandler } from '../input/InputHandler'
import { SoundEngine } from '../audio/SoundEngine'

const HIGH_SCORE_KEY = 'hatTrickHighScore'
const MAX_DELTA_MS = 50

export class Game {
  private phase: GamePhase = 'menu'
  private grid: Grid
  private shooter: Shooter
  private projectile: Projectile | null = null
  private score = 0
  private highScore = 0
  private combo = 1
  private fallingHats: FallingHat[] = []

  private targetingEnabled = false
  private targetCell: GridPos | null = null
  private targetGroup: Set<string> = new Set()

  private readonly renderer: Renderer
  private readonly hatRenderer: HatRenderer
  private readonly input: InputHandler
  private readonly sound: SoundEngine
  private animationId = 0
  private lastTimestamp = 0

  constructor(canvas: HTMLCanvasElement) {
    this.grid = new Grid()
    this.shooter = new Shooter()
    this.hatRenderer = new HatRenderer(HAT_RADIUS)
    this.renderer = new Renderer(canvas, this.hatRenderer)
    this.sound = new SoundEngine()
    this.input = new InputHandler(
      canvas,
      (x, y) => this.handleShoot(x, y),
      (x, y) => this.handleAim(x, y),
      (key) => this.handleKey(key),
    )
    this.highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0
  }

  async init(): Promise<void> {
    await Promise.all([
      this.hatRenderer.prerender(),
      this.renderer.init(),
    ])
  }

  start(): void {
    this.phase = 'menu'
    this.loop(0)
  }

  private loop(timestamp: number): void {
    const delta = Math.min(timestamp - this.lastTimestamp, MAX_DELTA_MS)
    this.lastTimestamp = timestamp

    if (this.phase === 'playing') {
      this.update(delta)
    }

    this.renderer.render(this.buildRenderState())
    this.animationId = requestAnimationFrame(t => this.loop(t))
  }

  private update(_delta: number): void {
    // Update falling hats
    this.fallingHats = this.fallingHats.filter(h => {
      h.vy += 0.4
      h.y += h.vy
      h.x += h.vx
      h.opacity -= 0.018
      return h.opacity > 0 && h.y < CANVAS_HEIGHT + HAT_RADIUS
    })

    if (!this.projectile?.active) return

    const bounced = this.projectile.update()
    if (bounced) this.sound.play('bounce')

    // Check hat collision first (takes priority over ceiling)
    const hitPos = this.projectile.hasHitHat(this.grid)
    if (hitPos) {
      const landPos = this.grid.findLandingCell(hitPos, this.projectile.x, this.projectile.y)
      if (landPos) {
        this.snapAndResolve(landPos)
      } else {
        this.projectile.active = false
        this.projectile = null
        this.checkLoss()
      }
      return
    }

    // Ceiling collision
    if (this.projectile.hasHitCeiling()) {
      const landPos = this.grid.snapToGrid(this.projectile.x, HAT_RADIUS)
      if (landPos) {
        this.snapAndResolve(landPos)
      } else {
        this.projectile.active = false
        this.projectile = null
      }
    }
  }

  private snapAndResolve(landPos: { row: number; col: number }): void {
    if (!this.projectile) return
    const type = this.projectile.type
    this.projectile.active = false
    this.projectile = null

    this.grid.setHat(landPos, type)

    const matched = this.grid.findMatches(landPos, type)

    if (matched.size >= MIN_MATCH_COUNT) {
      const matchedHats = this.grid.removeByKeys(matched)
      const disconnectedKeys = this.grid.findDisconnected()
      const fallenHats = this.grid.removeByKeys(disconnectedKeys)

      const { points, newCombo } = calculateShotScore(
        matchedHats.length,
        fallenHats.length,
        this.combo,
      )
      this.score += points
      this.combo = newCombo

      this.sound.play('match', this.combo)
      if (fallenHats.length > 0) {
        // Slight delay so fall sound doesn't clash with match sound
        setTimeout(() => this.sound.play('fall'), 120)
      }

      for (const hat of [...matchedHats, ...fallenHats]) {
        const { x, y } = this.grid.toPixel(hat.pos)
        this.fallingHats.push({
          type: hat.type,
          x,
          y,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 3,
          opacity: 1,
        })
      }

      if (this.score > this.highScore) {
        this.highScore = this.score
        localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore))
      }

      if (this.grid.size === 0) {
        this.phase = 'won'
        this.sound.play('win')
        return
      }
    } else {
      this.combo = 1
      this.sound.play('land')
    }

    this.checkLoss()
    // Recompute targeting for the next shot after grid has changed
    this.recomputeTarget()
  }

  private checkLoss(): void {
    if (this.grid.getLowestOccupiedY() > DANGER_ROW_Y) {
      this.phase = 'lost'
      this.sound.play('lose')
    }
  }

  private handleShoot(x: number, y: number): void {
    // Unlock AudioContext on first user gesture
    this.sound.resume()

    if (this.phase === 'menu') {
      this.startNewGame()
      return
    }
    if (this.phase === 'won' || this.phase === 'lost') {
      this.startNewGame()
      return
    }
    if (this.phase !== 'playing') return
    if (this.projectile?.active) return

    this.shooter.aimAt(x, y)
    this.projectile = this.shooter.fire()
    this.sound.play('shoot')
    // Clear targeting preview while projectile is in flight
    this.targetCell = null
    this.targetGroup = new Set()
  }

  private handleAim(x: number, y: number): void {
    if (this.phase !== 'playing' || this.projectile?.active) return
    this.shooter.aimAt(x, y)
    this.recomputeTarget()
  }

  private recomputeTarget(): void {
    if (!this.targetingEnabled || this.projectile?.active) {
      this.targetCell = null
      this.targetGroup = new Set()
      return
    }

    this.targetCell = simulateLanding(
      this.shooter.x, this.shooter.y, this.shooter.angleDeg,
      this.grid, CANVAS_WIDTH,
    )

    if (this.targetCell) {
      // Temporarily place the hat to compute the would-be match group
      this.grid.setHat(this.targetCell, this.shooter.currentType)
      this.targetGroup = this.grid.findMatchesAll(this.targetCell, this.shooter.currentType)
      this.grid.removeHat(this.targetCell)
    } else {
      this.targetGroup = new Set()
    }
  }

  private handleKey(key: string): void {
    if (key === 'p' || key === 'escape') {
      if (this.phase === 'playing') {
        this.phase = 'paused'
      } else if (this.phase === 'paused') {
        this.phase = 'playing'
        this.lastTimestamp = performance.now()
      }
    }
    if (key === 'm') {
      this.sound.toggleMute()
    }
    if (key === 'c') {
      this.targetingEnabled = !this.targetingEnabled
      this.recomputeTarget()
    }
  }

  private startNewGame(): void {
    this.grid = new Grid()
    this.grid.fillInitialGrid(INITIAL_ROWS)
    this.shooter = new Shooter()
    this.projectile = null
    this.score = 0
    this.combo = 1
    this.fallingHats = []
    this.targetCell = null
    this.targetGroup = new Set()
    this.phase = 'playing'
    this.lastTimestamp = performance.now()
  }

  private buildRenderState(): RenderState {
    return {
      phase: this.phase,
      grid: this.grid,
      shooter: this.shooter,
      projectile: this.projectile,
      fallingHats: this.fallingHats,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      muted: this.sound.muted,
      targeting: this.targetingEnabled,
      targetCell: this.targetCell,
      targetGroup: this.targetGroup,
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.animationId)
    this.input.destroy()
    this.hatRenderer.destroy()
    this.renderer.destroy()
    this.sound.destroy()
  }
}
