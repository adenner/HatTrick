import {
  GamePhase,
  FallingHat,
  GridPos,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DANGER_ROW_Y,
  MIN_MATCH_COUNT,
} from '../types'
import { Grid } from '../game/Grid'
import { Shooter } from '../game/Shooter'
import { Projectile, computeAimLine } from '../game/Projectile'
import { HatRenderer } from './HatRenderer'

/**
 * Snapshot of all game state required to produce a single frame.
 *
 * The {@link Renderer} is purely a display layer: it reads this struct and
 * never modifies it, which keeps rendering cleanly separated from game logic.
 */
export interface RenderState {
  /** Current phase of the game state machine (menu, playing, paused, won, lost). */
  phase: GamePhase

  /** The hexagonal grid holding all placed hats. */
  grid: Grid

  /** The bottom-of-screen cannon including its current aim angle and hat queue. */
  shooter: Shooter

  /**
   * The hat currently in flight, or `null` when no shot is active.
   * `projectile.active` is `false` once it has snapped to the grid.
   */
  projectile: Projectile | null

  /**
   * Hats that have been cleared from the grid and are animating off screen.
   * Each entry carries its own physics state (position, velocity, opacity).
   */
  fallingHats: FallingHat[]

  /** Player's current score for the active game session. */
  score: number

  /** All-time high score, persisted in `localStorage`. */
  highScore: number

  /**
   * Current consecutive-pop multiplier.
   * Starts at 1, increments on each successful match, resets to 1 on a miss.
   */
  combo: number

  /** Whether game audio is currently muted. Shown as an indicator in the HUD. */
  muted: boolean

  /**
   * Whether the targeting-assist ("cheat") overlay is active.
   * When `true`, a ghost hat and match-count badge are drawn at the predicted
   * landing cell before the player fires.
   */
  targeting: boolean

  /**
   * Grid cell the projectile is predicted to land on, or `null` when the
   * simulation cannot determine a landing cell (e.g. no grid to hit).
   * Only meaningful when `targeting` is `true`.
   */
  targetCell: GridPos | null

  /**
   * Set of grid-key strings (`"row,col"`) for all same-type hats connected to
   * the target cell, including the target cell itself.  Used by the targeting
   * overlay to highlight the would-be match group before the player fires.
   */
  targetGroup: Set<string>
}

/**
 * Stateless Canvas 2D renderer for Hat Trick.
 *
 * `Renderer` owns the `CanvasRenderingContext2D` and is the single point
 * responsible for every pixel drawn to the screen.  It is designed to be
 * called once per animation frame from the game loop:
 *
 * ```ts
 * renderer.render(buildRenderState())
 * ```
 *
 * The class holds no mutable game state of its own — the only internal state
 * is the pre-rendered `backgroundBitmap` created during {@link init}, which
 * is blitted each frame instead of being redrawn from scratch.
 *
 * Drawing is layered from back to front:
 * background → danger line → grid hats → falling hats →
 * aim line → targeting overlay → shooter → projectile → HUD → phase overlay.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly hatRenderer: HatRenderer
  private backgroundBitmap: ImageBitmap | null = null

  constructor(canvas: HTMLCanvasElement, hatRenderer: HatRenderer) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx
    this.hatRenderer = hatRenderer
  }

  /**
   * Pre-renders the static starfield background to an `OffscreenCanvas` and
   * converts it to an `ImageBitmap` for fast `drawImage` blitting.
   *
   * Must be `await`-ed before the first call to {@link render}.  If `render`
   * is called before `init` completes, a plain solid-colour fallback is used.
   */
  async init(): Promise<void> {
    const offscreen = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
    const ctx = offscreen.getContext('2d')!

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    grad.addColorStop(0, '#0d0d2b')
    grad.addColorStop(1, '#1a1a3a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
      for (let x = 20; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    this.backgroundBitmap = await createImageBitmap(offscreen)
  }

  /**
   * Draws a complete frame from the provided render state.
   *
   * Clears the canvas, then delegates to the appropriate private draw methods
   * based on `state.phase`.  The menu screen is self-contained; all other
   * phases share the background, grid, and shooter layers, with additional
   * overlays composited on top for `paused`, `won`, and `lost`.
   *
   * @param state - Snapshot of game state for this frame.
   */
  render(state: RenderState): void {
    const { ctx } = this
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    if (state.phase === 'menu') {
      this.drawMenu()
      return
    }

    this.drawBackground()
    this.drawDangerLine()
    this.drawGrid(state.grid)
    this.drawFallingHats(state.fallingHats)

    if (state.phase === 'playing' || state.phase === 'paused') {
      if (!state.projectile?.active) {
        const aimLine = computeAimLine(
          state.shooter.x,
          state.shooter.y,
          state.shooter.angleDeg,
          CANVAS_WIDTH,
        )
        this.drawAimLine(aimLine)
        if (state.targeting) {
          this.drawTargeting(state.grid, state.shooter, state.targetCell, state.targetGroup)
        }
      }
      this.drawShooter(state.shooter)
      if (state.projectile?.active) {
        this.drawProjectile(state.projectile)
      }
      this.drawHUD(state.score, state.highScore, state.combo, state.muted, state.targeting)
    }

    if (state.phase === 'paused') {
      this.drawPauseOverlay()
    } else if (state.phase === 'won') {
      this.drawEndScreen(true, state.score)
    } else if (state.phase === 'lost') {
      this.drawEndScreen(false, state.score)
    }
  }

  /**
   * Blits the pre-rendered background bitmap to the canvas.
   *
   * Falls back to a flat solid fill if {@link init} has not yet resolved.
   */
  private drawBackground(): void {
    if (this.backgroundBitmap) {
      this.ctx.drawImage(this.backgroundBitmap, 0, 0)
      return
    }
    // Fallback before init() completes
    this.ctx.fillStyle = '#0d0d2b'
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  /**
   * Draws the horizontal dashed red danger line at `DANGER_ROW_Y` and a
   * small "DANGER" label to the right of it.
   *
   * The danger line marks the boundary that causes a loss if any hat
   * descends below it.
   */
  private drawDangerLine(): void {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(0, DANGER_ROW_Y)
    ctx.lineTo(CANVAS_WIDTH, DANGER_ROW_Y)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255, 60, 60, 0.4)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('DANGER', CANVAS_WIDTH - 8, DANGER_ROW_Y - 4)
    ctx.restore()
  }

  /**
   * Iterates all occupied cells in the grid and draws each hat at its
   * pixel-space position using {@link HatRenderer}.
   *
   * @param grid - The current game grid to render.
   */
  private drawGrid(grid: Grid): void {
    for (const hat of grid.iterHats()) {
      const { x, y } = grid.toPixel(hat.pos)
      this.hatRenderer.drawHat(this.ctx, hat.type, x, y)
    }
  }

  /**
   * Draws all hats that are currently animating off screen after being popped
   * or disconnected.  Each hat is rendered at its current physics position
   * with its current opacity applied.
   *
   * @param hats - Array of in-flight falling hat particles.
   */
  private drawFallingHats(hats: FallingHat[]): void {
    for (const hat of hats) {
      this.hatRenderer.drawHat(this.ctx, hat.type, hat.x, hat.y, hat.opacity)
    }
  }

  /**
   * Draws the dashed aim line that shows the projectile's trajectory from
   * the shooter to the first bounce or landing point.
   *
   * The line is not drawn if fewer than two points are supplied (e.g. the
   * angle is straight up and no reflection is needed).
   *
   * @param points - Ordered list of waypoints along the aim path, including
   *   wall-reflection corners, produced by {@link computeAimLine}.
   */
  private drawAimLine(points: Array<{ x: number; y: number }>): void {
    if (points.length < 2) return
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 8])
    ctx.lineDashOffset = 0
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  /**
   * Draws the shooter cannon and its hat previews.
   *
   * Renders three distinct elements:
   * 1. **Barrel** — a rounded line rotated to match `shooter.angleDeg`.
   * 2. **Base platform** — an ellipse beneath the barrel pivot.
   * 3. **Current hat** — the hat type sitting in the chamber, drawn centred
   *    on the base.
   * 4. **Next hat preview** — a small labelled box in the bottom-left corner
   *    showing which hat will be loaded after the current one fires.
   *
   * @param shooter - Shooter state providing position, angle, and hat types.
   */
  private drawShooter(shooter: Shooter): void {
    const { ctx } = this
    const { x, y, angleDeg } = shooter

    // Barrel
    const barrelLen = 36
    const rad = (angleDeg * Math.PI) / 180
    const bx = x + Math.sin(rad) * barrelLen
    const by = y - Math.cos(rad) * barrelLen

    ctx.save()
    ctx.strokeStyle = '#aaaacc'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(bx, by)
    ctx.stroke()

    // Base platform
    ctx.fillStyle = '#334'
    ctx.strokeStyle = '#556'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y + 6, 28, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.restore()

    // Current hat in chamber (centered on base)
    this.hatRenderer.drawHat(ctx, shooter.currentType, x, y)

    // Next hat preview (bottom-left)
    const previewX = 42
    const previewY = CANVAS_HEIGHT - 42
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.strokeStyle = '#445'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(previewX - 36, previewY - 36, 72, 72, 8)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('NEXT', previewX, previewY + 30)
    ctx.restore()

    this.hatRenderer.drawHat(ctx, shooter.nextType, previewX, previewY - 2)
  }

  /**
   * Draws the hat projectile at its current pixel position while it is in
   * flight.
   *
   * @param proj - The active projectile whose position is read each frame.
   */
  private drawProjectile(proj: Projectile): void {
    this.hatRenderer.drawHat(this.ctx, proj.type, proj.x, proj.y)
  }

  /**
   * Draws the targeting-assist (cheat) overlay when it is enabled.
   *
   * The overlay has two parts:
   * - **Group highlight** — a glowing ring drawn around every hat in the
   *   connected same-type group that would be matched if the shot lands at
   *   `targetCell`.  Green when the group is large enough to pop
   *   (`>= MIN_MATCH_COUNT`), amber when it is not.
   * - **Ghost landing** — a semi-transparent ghost hat drawn at `targetCell`
   *   with a dashed landing ring and a small badge showing the current group
   *   size (prefixed with ✓ when it will pop).
   *
   * @param grid        - Current grid, used for pixel-space lookups.
   * @param shooter     - Provides the hat type being aimed for the ghost sprite.
   * @param targetCell  - Predicted landing cell, or `null` if undetermined.
   * @param targetGroup - Set of grid-key strings (`"row,col"`) forming the
   *   connected same-type group including `targetCell`.
   */
  private drawTargeting(
    grid: Grid,
    shooter: Shooter,
    targetCell: GridPos | null,
    targetGroup: Set<string>,
  ): void {
    const { ctx } = this
    const willPop = targetGroup.size >= MIN_MATCH_COUNT
    const ringColor = willPop ? 'rgba(80,255,120,0.85)' : 'rgba(255,200,60,0.55)'
    const glowColor = willPop ? 'rgba(80,255,120,0.3)' : 'rgba(255,200,60,0.15)'

    // Highlight each hat in the connected group
    for (const key of targetGroup) {
      // Skip the target cell itself — it'll get the ghost treatment below
      if (targetCell && key === `${targetCell.row},${targetCell.col}`) continue
      const [row, col] = key.split(',').map(Number)
      const { x, y } = grid.toPixel({ row, col })

      ctx.save()
      ctx.shadowColor = ringColor
      ctx.shadowBlur = 12
      ctx.strokeStyle = ringColor
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, 26, 0, Math.PI * 2)
      ctx.stroke()

      // Subtle fill tint
      ctx.fillStyle = glowColor
      ctx.fill()
      ctx.restore()
    }

    // Ghost hat at landing cell
    if (targetCell) {
      const { x, y } = grid.toPixel(targetCell)

      // Landing ring
      ctx.save()
      ctx.shadowColor = willPop ? 'rgba(80,255,120,0.9)' : 'rgba(255,200,60,0.7)'
      ctx.shadowBlur = 18
      ctx.strokeStyle = willPop ? 'rgba(80,255,120,0.9)' : 'rgba(255,200,60,0.8)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(x, y, 26, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Ghost hat sprite
      this.hatRenderer.drawHat(ctx, shooter.currentType, x, y, 0.35)

      // Match count badge
      const count = targetGroup.size
      if (count > 0) {
        const label = willPop ? `✓ ${count}` : `${count}`
        ctx.save()
        const badgeX = x + 18
        const badgeY = y - 20

        ctx.fillStyle = willPop ? 'rgba(30,180,80,0.9)' : 'rgba(160,120,0,0.85)'
        ctx.beginPath()
        ctx.roundRect(badgeX - 2, badgeY - 13, label.length * 8 + 4, 16, 4)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(label, badgeX, badgeY)
        ctx.restore()
      }
    }
  }

  /**
   * Draws the heads-up display elements overlaid on the gameplay canvas.
   *
   * Renders:
   * - **Score panel** (top-right) — current score in large text with the
   *   all-time best score in smaller text beneath it.
   * - **Combo indicator** (top-left) — shown only when `combo > 1`; colour
   *   intensifies (orange → gold) as the multiplier rises.
   * - **Mute indicator** (bottom-left) — shows current mute state with an
   *   icon; dimmed when unmuted, red when muted.
   * - **Targeting indicator** (bottom-left, below mute) — shows whether the
   *   targeting-assist cheat is on; green when active, dimmed otherwise.
   *
   * @param score      - Player's current score.
   * @param highScore  - All-time high score.
   * @param combo      - Current combo multiplier.
   * @param muted      - Whether audio is muted.
   * @param targeting  - Whether targeting assist is enabled.
   */
  private drawHUD(score: number, highScore: number, combo: number, muted: boolean, targeting: boolean): void {
    const { ctx } = this
    ctx.save()

    // Score panel background
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(CANVAS_WIDTH - 150, 8, 142, 60, 6)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(score.toLocaleString(), CANVAS_WIDTH - 12, 38)

    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '11px monospace'
    ctx.fillText(`BEST ${highScore.toLocaleString()}`, CANVAS_WIDTH - 12, 58)

    // Combo indicator
    if (combo > 1) {
      ctx.fillStyle = combo >= 4 ? '#ffcc00' : '#ff8844'
      ctx.font = `bold ${14 + combo}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`×${combo} COMBO`, 12, 38)
    }

    // Mute / targeting indicators (bottom-left)
    ctx.font = '13px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = muted ? 'rgba(255,80,80,0.8)' : 'rgba(255,255,255,0.28)'
    ctx.fillText(muted ? '🔇 M' : '🔊 M', 12, CANVAS_HEIGHT - 32)

    ctx.fillStyle = targeting ? 'rgba(80,255,120,0.9)' : 'rgba(255,255,255,0.28)'
    ctx.fillText(targeting ? '🎯 C' : '◎ C', 12, CANVAS_HEIGHT - 16)

    ctx.restore()
  }

  /**
   * Draws the full-canvas main menu screen shown before the first game and
   * after the page is loaded.
   *
   * Includes: gradient background, title ("HAT TRICK"), tagline, a
   * "Click to Start" call-to-action, and a brief control hint.
   */
  private drawMenu(): void {
    const { ctx } = this

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    grad.addColorStop(0, '#0a0a20')
    grad.addColorStop(1, '#1a0a30')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Title
    ctx.save()
    ctx.textAlign = 'center'
    ctx.shadowColor = '#8844ff'
    ctx.shadowBlur = 20

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 64px monospace'
    ctx.fillText('HAT', CANVAS_WIDTH / 2, 200)

    ctx.fillStyle = '#cc88ff'
    ctx.font = 'bold 48px monospace'
    ctx.fillText('TRICK', CANVAS_WIDTH / 2, 260)

    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '18px monospace'
    ctx.fillText('Match 3 or more hats to pop them!', CANVAS_WIDTH / 2, 340)

    ctx.fillStyle = '#aaffaa'
    ctx.font = 'bold 22px monospace'
    ctx.fillText('Click to Start', CANVAS_WIDTH / 2, 420)

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '13px monospace'
    ctx.fillText('Move mouse to aim · Click to shoot', CANVAS_WIDTH / 2, 480)
    ctx.fillText('P pause · M mute · C targeting cheat', CANVAS_WIDTH / 2, 500)

    ctx.restore()
  }

  /**
   * Composites a semi-transparent dark overlay with a "PAUSED" message on
   * top of the already-drawn gameplay frame.
   *
   * Called only when `phase === 'paused'`, after all gameplay elements have
   * been drawn, so the grid and shooter remain dimly visible underneath.
   */
  private drawPauseOverlay(): void {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px monospace'
    ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '18px monospace'
    ctx.fillText('Press P to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30)
    ctx.restore()
  }

  /**
   * Draws the win or game-over end screen over the current frame.
   *
   * The overlay opacity, headline colour, and text all differ depending on
   * `won`.  A "Click to play again" prompt is shown beneath the final score.
   *
   * @param won   - `true` to show the win screen; `false` for game over.
   * @param score - The player's final score for this session.
   */
  private drawEndScreen(won: boolean, score: number): void {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = `rgba(0,0,0,${won ? 0.5 : 0.65})`
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.textAlign = 'center'
    ctx.shadowColor = won ? '#44ff88' : '#ff4444'
    ctx.shadowBlur = 20

    ctx.fillStyle = won ? '#44ff88' : '#ff6666'
    ctx.font = 'bold 52px monospace'
    ctx.fillText(won ? 'YOU WIN!' : 'GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60)

    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px monospace'
    ctx.fillText(`Score: ${score.toLocaleString()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)

    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '18px monospace'
    ctx.fillText('Click to play again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60)
    ctx.restore()
  }

  /**
   * Releases the pre-rendered background bitmap and frees its GPU memory.
   *
   * Should be called when the game is torn down (e.g. the canvas element is
   * removed from the DOM) to avoid memory leaks.
   */
  destroy(): void {
    this.backgroundBitmap?.close()
    this.backgroundBitmap = null
  }
}
