import {
  GamePhase,
  FallingHat,
  ConfettiParticle,
  GridPos,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HAT_RADIUS,
  DANGER_ROW_Y,
  INITIAL_ROWS,
  MIN_MATCH_COUNT,
  SHOTS_PER_ADVANCE,
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

/**
 * Top-level orchestrator for Hat Trick.
 *
 * `Game` owns every subsystem — grid, shooter, projectile, renderer, input,
 * and audio — and is the single source of truth for all mutable game state.
 */
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
  private shotsUntilAdvance = SHOTS_PER_ADVANCE
  private level = 0
  private colorBlindMode = false

  private shakeFrames = 0
  private shakeX = 0
  private shakeY = 0

  private confetti: ConfettiParticle[] = []

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
    this.highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10)
  }

  /** Pre-renders all game assets before the first frame is drawn. */
  async init(): Promise<void> {
    await Promise.all([
      this.hatRenderer.prerender(),
      this.renderer.init(),
    ])
  }

  /** Enters the menu phase and kicks off the `requestAnimationFrame` render loop. */
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

    // Shake and confetti run regardless of phase
    const dt = delta / (1000 / 60)
    if (this.shakeFrames > 0) {
      const t = this.shakeFrames / 10
      this.shakeX = (Math.random() - 0.5) * 8 * t
      this.shakeY = (Math.random() - 0.5) * 4 * t
      this.shakeFrames--
    } else {
      this.shakeX = 0
      this.shakeY = 0
    }

    this.confetti = this.confetti.filter(p => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 0.05 * dt
      p.rotation += p.rotationSpeed * dt
      p.opacity -= 0.004 * dt
      return p.opacity > 0 && p.y < CANVAS_HEIGHT + 20
    })

    this.renderer.render(this.buildRenderState())
    this.animationId = requestAnimationFrame(t => this.loop(t))
  }

  private update(delta: number): void {
    const dt = delta / (1000 / 60)
    this.fallingHats = this.fallingHats.filter(h => {
      h.vy += 0.4 * dt
      h.y += h.vy * dt
      h.x += h.vx * dt
      h.opacity -= 0.018 * dt
      return h.opacity > 0 && h.y < CANVAS_HEIGHT + HAT_RADIUS
    })

    if (!this.projectile?.active) return

    const bounced = this.projectile.update()
    if (bounced) this.sound.play('bounce')

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

    this.shotsUntilAdvance--
    if (this.shotsUntilAdvance === 1 || this.shotsUntilAdvance === 2) {
      this.sound.play('alert')
    }
    if (this.shotsUntilAdvance <= 0) {
      this.level++
      this.shotsUntilAdvance = Math.max(4, SHOTS_PER_ADVANCE - Math.floor(this.level / 2))
      this.grid.advanceRows()
      this.shakeFrames = 10
      this.checkLoss()
      if (this.phase !== 'playing') return
    }

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
        const id = setTimeout(() => {
          clearTimeout(id)
          this.sound.play('fall')
        }, 120)
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
        this.spawnConfetti()
        return
      }
    } else {
      this.combo = 1
      this.sound.play('land')
    }

    this.checkLoss()
    this.shooter.setTypePool(this.grid.getActiveTypes())
    this.recomputeTarget()
  }

  private spawnConfetti(): void {
    const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8', '#20c997']
    for (let i = 0; i < 80; i++) {
      this.confetti.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT * 0.4,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 2 + 1,
        color: COLORS[i % COLORS.length],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        width: Math.random() * 8 + 5,
        height: Math.random() * 4 + 3,
        opacity: 1,
      })
    }
  }

  private checkLoss(): void {
    if (this.grid.getLowestOccupiedY() > DANGER_ROW_Y) {
      this.phase = 'lost'
      this.sound.play('lose')
    }
  }

  private handleShoot(x: number, y: number): void {
    this.sound.resume()

    if (this.phase === 'menu' || this.phase === 'won' || this.phase === 'lost') {
      this.startNewGame()
      return
    }
    if (this.phase !== 'playing') return
    if (this.projectile?.active) return

    this.shooter.aimAt(x, y)
    this.projectile = this.shooter.fire()
    this.sound.play('shoot')
    this.targetCell = null
    this.targetGroup = new Set()
  }

  private handleAim(x: number, y: number): void {
    if (this.phase !== 'playing' || this.projectile?.active) return
    this.shooter.aimAt(x, y)
    this.recomputeTarget()
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
    if (key === 'h') {
      if (this.phase === 'playing' && !this.projectile?.active) {
        this.shooter.hold()
        this.sound.play(this.shooter.holdType !== null ? 'swap' : 'hold')
        this.recomputeTarget()
      }
    }
    if (key === 'b') {
      this.colorBlindMode = !this.colorBlindMode
    }
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
      this.grid.setHat(this.targetCell, this.shooter.currentType)
      this.targetGroup = this.grid.findMatchesAll(this.targetCell, this.shooter.currentType)
      this.grid.removeHat(this.targetCell)
    } else {
      this.targetGroup = new Set()
    }
  }

  private startNewGame(): void {
    this.grid = new Grid()
    this.grid.fillInitialGrid(INITIAL_ROWS)
    this.shooter = new Shooter()
    this.shooter.setTypePool(this.grid.getActiveTypes())
    this.projectile = null
    this.score = 0
    this.combo = 1
    this.level = 0
    this.fallingHats = []
    this.confetti = []
    this.targetCell = null
    this.targetGroup = new Set()
    this.shotsUntilAdvance = SHOTS_PER_ADVANCE
    this.shakeFrames = 0
    this.shakeX = 0
    this.shakeY = 0
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
      shotsUntilAdvance: this.shotsUntilAdvance,
      level: this.level,
      holdType: this.shooter.holdType,
      shakeX: this.shakeX,
      shakeY: this.shakeY,
      confetti: this.confetti,
      colorBlindMode: this.colorBlindMode,
    }
  }

  /** Tears down the game and releases all resources. */
  destroy(): void {
    cancelAnimationFrame(this.animationId)
    this.input.destroy()
    this.hatRenderer.destroy()
    this.renderer.destroy()
    this.sound.destroy()
  }
}
