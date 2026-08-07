import {
  GamePhase,
  FallingHat,
  ConfettiParticle,
  GridPos,
  HatType,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HAT_RADIUS,
  DANGER_ROW_Y,
  MIN_MATCH_COUNT,
} from '../types'
import { Grid } from '../game/Grid'
import { Shooter } from '../game/Shooter'
import { Projectile, computeAimLine } from '../game/Projectile'
import { HatRenderer } from './HatRenderer'

/**
 * Snapshot of all game state required to produce a single frame.
 */
export interface RenderState {
  phase: GamePhase
  grid: Grid
  shooter: Shooter
  projectile: Projectile | null
  fallingHats: FallingHat[]
  score: number
  highScore: number
  combo: number
  muted: boolean
  targeting: boolean
  targetCell: GridPos | null
  targetGroup: Set<string>
  shotsUntilAdvance: number
  /** Current level (number of grid advances that have occurred this game). */
  level: number
  /** Hat type stashed in the hold slot, or `null` when the slot is empty. */
  holdType: HatType | null
  /** Horizontal canvas-shake offset in px for the current frame. */
  shakeX: number
  /** Vertical canvas-shake offset in px for the current frame. */
  shakeY: number
  /** Confetti particles spawned on the win screen. */
  confetti: ConfettiParticle[]
  /** Whether colorblind symbol overlays are drawn on top of each hat. */
  colorBlindMode: boolean
}

/**
 * Stateless Canvas 2D renderer for Hat Trick.
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

  render(state: RenderState): void {
    const { ctx } = this
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    if (state.phase === 'menu') {
      this.drawMenu()
      return
    }

    // Apply screen shake by translating the entire canvas for this frame
    ctx.save()
    ctx.translate(state.shakeX, state.shakeY)

    this.drawBackground()
    this.drawDangerLine()
    this.drawGrid(state.grid, state.colorBlindMode)
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
      this.drawShooter(state.shooter, state.holdType)
      if (state.projectile?.active) {
        this.drawProjectile(state.projectile)
      }
      this.drawHUD(state.score, state.highScore, state.combo, state.muted, state.targeting, state.shotsUntilAdvance, state.level)
    }

    if (state.phase === 'paused') {
      this.drawPauseOverlay()
    } else if (state.phase === 'won') {
      this.drawEndScreen(true, state.score)
      this.drawConfetti(state.confetti)
    } else if (state.phase === 'lost') {
      this.drawEndScreen(false, state.score)
    }

    ctx.restore()
  }

  private drawBackground(): void {
    if (this.backgroundBitmap) {
      this.ctx.drawImage(this.backgroundBitmap, 0, 0)
      return
    }
    this.ctx.fillStyle = '#0d0d2b'
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

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

  private drawGrid(grid: Grid, colorBlindMode: boolean): void {
    for (const hat of grid.iterHats()) {
      const { x, y } = grid.toPixel(hat.pos)
      this.hatRenderer.drawHat(this.ctx, hat.type, x, y)
      if (colorBlindMode) this.drawSymbol(hat.type, x, y)
    }
  }

  private drawFallingHats(hats: FallingHat[]): void {
    for (const hat of hats) {
      this.hatRenderer.drawHat(this.ctx, hat.type, hat.x, hat.y, hat.opacity)
    }
  }

  private drawAimLine(points: Array<{ x: number; y: number }>): void {
    if (points.length < 2) return
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 8])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  private drawShooter(shooter: Shooter, holdType: HatType | null): void {
    const { ctx } = this
    const { x, y, angleDeg } = shooter

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

    ctx.fillStyle = '#334'
    ctx.strokeStyle = '#556'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y + 6, 28, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

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

    // Hold slot (bottom-right)
    const holdX = CANVAS_WIDTH - 42
    const holdY = CANVAS_HEIGHT - 42
    ctx.save()
    ctx.fillStyle = holdType !== null ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)'
    ctx.strokeStyle = holdType !== null ? '#664' : '#334'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(holdX - 36, holdY - 36, 72, 72, 8)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = holdType !== null ? 'rgba(255,220,100,0.7)' : 'rgba(255,255,255,0.25)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('HOLD H', holdX, holdY + 30)
    ctx.restore()

    if (holdType !== null) {
      this.hatRenderer.drawHat(ctx, holdType, holdX, holdY - 2)
    } else {
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.font = '22px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('H', holdX, holdY - 2)
      ctx.textBaseline = 'alphabetic'
      ctx.restore()
    }
  }

  private drawProjectile(proj: Projectile): void {
    this.hatRenderer.drawHat(this.ctx, proj.type, proj.x, proj.y)
  }

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

    for (const key of targetGroup) {
      if (targetCell && key === `${targetCell.row},${targetCell.col}`) continue
      const [row, col] = key.split(',').map(Number)
      const { x, y } = grid.toPixel({ row, col })

      ctx.save()
      ctx.shadowColor = ringColor
      ctx.shadowBlur = 12
      ctx.strokeStyle = ringColor
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, HAT_RADIUS + 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = glowColor
      ctx.fill()
      ctx.restore()
    }

    if (targetCell) {
      const { x, y } = grid.toPixel(targetCell)

      ctx.save()
      ctx.shadowColor = willPop ? 'rgba(80,255,120,0.9)' : 'rgba(255,200,60,0.7)'
      ctx.shadowBlur = 18
      ctx.strokeStyle = willPop ? 'rgba(80,255,120,0.9)' : 'rgba(255,200,60,0.8)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(x, y, HAT_RADIUS + 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      this.hatRenderer.drawHat(ctx, shooter.currentType, x, y, 0.35)

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

  private drawHUD(score: number, highScore: number, combo: number, muted: boolean, targeting: boolean, shotsUntilAdvance: number, level: number): void {
    const { ctx } = this
    ctx.save()

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

    if (combo > 1) {
      ctx.fillStyle = combo >= 4 ? '#ffcc00' : '#ff8844'
      ctx.font = `bold ${14 + combo}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`×${combo} COMBO`, 12, 38)
    }

    ctx.font = '13px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = muted ? 'rgba(255,80,80,0.8)' : 'rgba(255,255,255,0.28)'
    ctx.fillText(muted ? '🔇 M' : '🔊 M', 12, CANVAS_HEIGHT - 32)

    ctx.fillStyle = targeting ? 'rgba(80,255,120,0.9)' : 'rgba(255,255,255,0.28)'
    ctx.fillText(targeting ? '🎯 C' : '◎ C', 12, CANVAS_HEIGHT - 16)

    // Level + advance countdown (top-left)
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(200,200,255,0.6)'
    ctx.fillText(`LEVEL ${level + 1}`, 12, 20)

    const advanceColor = shotsUntilAdvance <= 2
      ? 'rgba(255,80,80,0.95)'
      : shotsUntilAdvance <= 4
        ? 'rgba(255,180,60,0.9)'
        : 'rgba(180,220,255,0.55)'
    ctx.fillStyle = advanceColor
    ctx.fillText(`▼ ADVANCE IN: ${shotsUntilAdvance}`, 12, 34)

    ctx.restore()
  }

  private drawMenu(): void {
    const { ctx } = this

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    grad.addColorStop(0, '#0a0a20')
    grad.addColorStop(1, '#1a0a30')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

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
    ctx.fillText('P pause · M mute · C target · H hold · B colorblind', CANVAS_WIDTH / 2, 500)

    ctx.restore()
  }

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

  /** Draws confetti particles as small rotated filled rectangles. */
  private drawConfetti(particles: ConfettiParticle[]): void {
    const { ctx } = this
    for (const p of particles) {
      ctx.save()
      ctx.globalAlpha = p.opacity
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
      ctx.restore()
    }
  }

  /**
   * Draws a small white symbol on a hat for colorblind accessibility.
   * Each HatType gets a distinct shape centered on the hat's crown area.
   */
  private drawSymbol(type: HatType, cx: number, cy: number): void {
    const { ctx } = this
    const sx = cx
    const sy = cy - 6
    const r = 7

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 3
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'

    switch (type) {
      case 0: // TOP_HAT — triangle
        ctx.beginPath()
        ctx.moveTo(sx, sy - r)
        ctx.lineTo(sx + r * 0.87, sy + r * 0.5)
        ctx.lineTo(sx - r * 0.87, sy + r * 0.5)
        ctx.closePath()
        ctx.fill()
        break
      case 1: // FEDORA — circle
        ctx.beginPath()
        ctx.arc(sx, sy, r * 0.75, 0, Math.PI * 2)
        ctx.fill()
        break
      case 2: // COWBOY — square
        ctx.fillRect(sx - r * 0.72, sy - r * 0.72, r * 1.44, r * 1.44)
        break
      case 3: // WITCH — X
        ctx.beginPath()
        ctx.moveTo(sx - r * 0.7, sy - r * 0.7); ctx.lineTo(sx + r * 0.7, sy + r * 0.7)
        ctx.moveTo(sx + r * 0.7, sy - r * 0.7); ctx.lineTo(sx - r * 0.7, sy + r * 0.7)
        ctx.stroke()
        break
      case 4: // BASEBALL_CAP — diamond
        ctx.beginPath()
        ctx.moveTo(sx, sy - r)
        ctx.lineTo(sx + r * 0.72, sy)
        ctx.lineTo(sx, sy + r)
        ctx.lineTo(sx - r * 0.72, sy)
        ctx.closePath()
        ctx.fill()
        break
      case 5: // BERET — plus
        ctx.beginPath()
        ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r)
        ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy)
        ctx.stroke()
        break
      case 6: // PROPELLER — 3-spoke burst
        for (let i = 0; i < 3; i++) {
          const angle = (i * Math.PI * 2) / 3 - Math.PI / 2
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(sx + Math.cos(angle) * r, sy + Math.sin(angle) * r)
          ctx.stroke()
        }
        break
    }

    ctx.restore()
  }

  /** Releases the pre-rendered background bitmap. */
  destroy(): void {
    this.backgroundBitmap?.close()
    this.backgroundBitmap = null
  }
}
