import {
  GamePhase,
  FallingHat,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DANGER_ROW_Y,
} from '../types'
import { Grid } from '../game/Grid'
import { Shooter } from '../game/Shooter'
import { Projectile } from '../game/Projectile'
import { HatRenderer } from './HatRenderer'

export interface RenderState {
  phase: GamePhase
  grid: Grid
  shooter: Shooter
  projectile: Projectile | null
  aimLine: Array<{ x: number; y: number }>
  fallingHats: FallingHat[]
  score: number
  highScore: number
  combo: number
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly hatRenderer: HatRenderer

  constructor(canvas: HTMLCanvasElement, hatRenderer: HatRenderer) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx
    this.hatRenderer = hatRenderer
  }

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
      this.drawAimLine(state.aimLine)
      this.drawShooter(state.shooter)
      if (state.projectile?.active) {
        this.drawProjectile(state.projectile)
      }
      this.drawHUD(state.score, state.highScore, state.combo)
    }

    if (state.phase === 'paused') {
      this.drawPauseOverlay()
    } else if (state.phase === 'won') {
      this.drawEndScreen(true, state.score)
    } else if (state.phase === 'lost') {
      this.drawEndScreen(false, state.score)
    }
  }

  private drawBackground(): void {
    const { ctx } = this
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    grad.addColorStop(0, '#0d0d2b')
    grad.addColorStop(1, '#1a1a3a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Subtle grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
      for (let x = 20; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
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

  private drawGrid(grid: Grid): void {
    for (const hat of grid.getAllHats()) {
      const { x, y } = grid.toPixel(hat.pos)
      this.hatRenderer.drawHat(this.ctx, hat.type, x, y)
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

  private drawProjectile(proj: Projectile): void {
    this.hatRenderer.drawHat(this.ctx, proj.type, proj.x, proj.y)
  }

  private drawHUD(score: number, highScore: number, combo: number): void {
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

    ctx.restore()
  }

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
    ctx.fillText('Press P to pause', CANVAS_WIDTH / 2, 500)

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
}
