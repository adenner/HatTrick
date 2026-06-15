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

/**
 * Top-level orchestrator for Hat Trick.
 *
 * `Game` owns every subsystem — grid, shooter, projectile, renderer, input,
 * and audio — and is the single source of truth for all mutable game state.
 * It drives the `requestAnimationFrame` loop, routes input events to the
 * correct handlers, and assembles a {@link RenderState} snapshot each frame
 * for the {@link Renderer} to consume.
 *
 * Typical lifecycle:
 * ```ts
 * const game = new Game(canvas)
 * await game.init()   // pre-render assets
 * game.start()        // begin the RAF loop (shows menu)
 * // ... player interacts ...
 * game.destroy()      // cancel RAF, detach listeners, free GPU memory
 * ```
 *
 * The state machine progresses through {@link GamePhase} values:
 * `menu` → `playing` → (`paused` ↔ `playing`) → `won` | `lost` → `playing` …
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

  /**
   * Asynchronously pre-renders all game assets before the first frame is drawn.
   *
   * Runs {@link HatRenderer.prerender} and {@link Renderer.init} in parallel so
   * that both hat sprite bitmaps and the static background bitmap are ready
   * before gameplay begins.  Must be `await`-ed before calling {@link start}.
   */
  async init(): Promise<void> {
    await Promise.all([
      this.hatRenderer.prerender(),
      this.renderer.init(),
    ])
  }

  /**
   * Enters the menu phase and kicks off the `requestAnimationFrame` render loop.
   *
   * After this call returns, the game loop runs autonomously until
   * {@link destroy} is called.  Call {@link init} first to ensure assets are
   * ready.
   */
  start(): void {
    this.phase = 'menu'
    this.loop(0)
  }

  /**
   * Core animation loop — called by `requestAnimationFrame` on every display
   * refresh.
   *
   * Computes the elapsed time since the previous frame (capped at
   * `MAX_DELTA_MS` to prevent large jumps after tab focus is restored),
   * advances the simulation when playing, renders the current frame, and
   * schedules the next iteration.
   *
   * @param timestamp - High-resolution timestamp supplied by the browser's RAF
   *   callback, in milliseconds.
   */
  private loop(timestamp: number): void {
    const delta = Math.min(timestamp - this.lastTimestamp, MAX_DELTA_MS)
    this.lastTimestamp = timestamp

    if (this.phase === 'playing') {
      this.update(delta)
    }

    this.renderer.render(this.buildRenderState())
    this.animationId = requestAnimationFrame(t => this.loop(t))
  }

  /**
   * Advances all in-flight simulation state by one frame.
   *
   * Responsibilities (in order):
   * 1. Steps falling-hat particles (gravity, fade) and culls any that have
   *    either fully faded out or scrolled below the canvas.
   * 2. Updates the active projectile's position via {@link Projectile.update};
   *    plays a bounce sound if a wall reflection occurred.
   * 3. Checks for hat-collision first (the projectile hit an existing grid hat)
   *    then ceiling collision, and calls {@link snapAndResolve} for either.
   *
   * Does nothing when there is no active projectile.
   *
   * @param _delta - Elapsed time in ms since the last frame (currently unused
   *   because all motion uses per-frame constants rather than delta-time).
   */
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

  /**
   * Places the in-flight projectile into the grid at `landPos` and resolves
   * all downstream consequences of that placement.
   *
   * Resolution order:
   * 1. The projectile's hat type is written into `landPos` via
   *    {@link Grid.setHat}.
   * 2. A BFS match search ({@link Grid.findMatches}) finds all same-type
   *    neighbours connected to `landPos`.
   * 3. **If a match of `>= MIN_MATCH_COUNT` is found:**
   *    - The matched hats are removed and converted to falling particles.
   *    - A disconnection sweep ({@link Grid.findDisconnected}) is run; any
   *      newly floating hats are also removed and sent falling.
   *    - Score and combo are updated via {@link calculateShotScore}.
   *    - Match and fall sounds are triggered.
   *    - If the grid is now empty, the player wins.
   * 4. **On a miss** (group too small): combo resets to 1 and a land sound plays.
   * 5. {@link checkLoss} is called to detect danger-line overflow.
   * 6. The targeting overlay is refreshed for the next shot.
   *
   * @param landPos - Grid cell (`row`, `col`) where the projectile will snap.
   */
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

  /**
   * Checks whether the lowest occupied row of the grid has crossed the danger
   * line, and if so transitions to the `'lost'` phase.
   *
   * Called after every snap-and-resolve so that a newly placed hat that pushes
   * the cluster past `DANGER_ROW_Y` is detected immediately.
   */
  private checkLoss(): void {
    if (this.grid.getLowestOccupiedY() > DANGER_ROW_Y) {
      this.phase = 'lost'
      this.sound.play('lose')
    }
  }

  /**
   * Handles a click (or tap) from the player.
   *
   * Unlocks the `AudioContext` on the first gesture (browser policy), then
   * branches based on the current phase:
   * - `menu`, `won`, `lost` → start a new game.
   * - `playing` (no active projectile) → aim at `(x, y)` and fire.
   * - Any other phase (e.g. `paused`) → ignore.
   *
   * @param x - Canvas-relative X coordinate of the click/tap.
   * @param y - Canvas-relative Y coordinate of the click/tap.
   */
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

  /**
   * Handles mouse/touch movement by updating the shooter's aim angle and
   * refreshing the targeting overlay.
   *
   * Ignored when the game is not in the `'playing'` phase or while a
   * projectile is already in flight.
   *
   * @param x - Canvas-relative X coordinate of the pointer.
   * @param y - Canvas-relative Y coordinate of the pointer.
   */
  private handleAim(x: number, y: number): void {
    if (this.phase !== 'playing' || this.projectile?.active) return
    this.shooter.aimAt(x, y)
    this.recomputeTarget()
  }

  /**
   * Handles a keyboard key press.
   *
   * - `p` / `Escape` — toggle between `'playing'` and `'paused'` phases;
   *   resets `lastTimestamp` on resume to avoid a large delta spike.
   * - `m` — toggle audio mute via {@link SoundEngine.toggleMute}.
   * - `c` — toggle the targeting-assist cheat overlay; immediately
   *   recomputes the predicted target for the current aim direction.
   *
   * @param key - Lowercase key string from the keyboard event (e.g. `'p'`,
   *   `'m'`, `'c'`, `'escape'`).
   */
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

  /**
   * Recomputes the targeting-assist overlay for the current shooter angle.
   *
   * Steps:
   * 1. If targeting is disabled or a projectile is active, clears
   *    `targetCell` and `targetGroup` and returns early.
   * 2. Runs {@link simulateLanding} to find where the shot would land.
   * 3. Temporarily places the current hat type at that cell and runs a full
   *    BFS match search ({@link Grid.findMatchesAll}) to determine the
   *    would-be group size, then removes the temporary hat.
   *
   * The result is stored in `targetCell` / `targetGroup` and passed through
   * {@link buildRenderState} to {@link Renderer.drawTargeting} each frame.
   */
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

  /**
   * Resets all game state and begins a new round in the `'playing'` phase.
   *
   * Creates fresh {@link Grid} and {@link Shooter} instances, seeds the grid
   * with `INITIAL_ROWS` of random hats, zeroes the score and combo, and
   * clears any in-flight particles and targeting state.
   */
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

  /**
   * Assembles a {@link RenderState} snapshot from the current game state.
   *
   * This snapshot is the sole communication channel between the game logic
   * layer and the renderer.  It is constructed every frame and passed
   * directly to {@link Renderer.render}; the renderer reads it without
   * mutating it.
   *
   * @returns A plain-object snapshot of all state needed to draw the current
   *   frame, including phase, grid, shooter, projectile, particles, score,
   *   and targeting data.
   */
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

  /**
   * Tears down the game and releases all resources.
   *
   * Cancels the active `requestAnimationFrame` callback, detaches all input
   * listeners, frees pre-rendered hat bitmaps and the background bitmap, and
   * closes the audio context.  Safe to call at any point in the lifecycle.
   */
  destroy(): void {
    cancelAnimationFrame(this.animationId)
    this.input.destroy()
    this.hatRenderer.destroy()
    this.renderer.destroy()
    this.sound.destroy()
  }
}
