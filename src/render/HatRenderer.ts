import { HatType, HAT_TYPE_COUNT, HAT_RADIUS } from '../types'
import { HAT_SPRITES, SvgLayer } from '../sprites/hats'

function drawLayers(ctx: OffscreenCanvasRenderingContext2D, layers: SvgLayer[]): void {
  for (const layer of layers) {
    const path = new Path2D(layer.d)
    ctx.fillStyle = layer.fill
    ctx.fill(path)
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke
      ctx.lineWidth = layer.strokeWidth ?? 1
      ctx.stroke(path)
    }
  }
}

export class HatRenderer {
  private cache = new Map<HatType, ImageBitmap>()
  private readonly radius: number
  /** Size of each pre-rendered sprite canvas (with padding) */
  private readonly size: number

  constructor(radius: number = HAT_RADIUS) {
    this.radius = radius
    this.size = radius * 3  // generous padding for strokes/overhangs
  }

  async prerender(): Promise<void> {
    const promises: Array<Promise<void>> = []
    for (let t = 0; t < HAT_TYPE_COUNT; t++) {
      const type = t as HatType
      promises.push(this.prerenderOne(type))
    }
    await Promise.all(promises)
  }

  private async prerenderOne(type: HatType): Promise<void> {
    const { size, radius } = this
    const offscreen = new OffscreenCanvas(size, size)
    const ctx = offscreen.getContext('2d')!

    // Center the origin and scale from design radius 24 to actual radius
    ctx.translate(size / 2, size / 2)
    ctx.scale(radius / 24, radius / 24)

    // Outer glow circle
    const sprite = HAT_SPRITES[type]
    ctx.shadowColor = sprite.glowColor
    ctx.shadowBlur = 8

    drawLayers(ctx, sprite.layers)

    // Outline circle to unify shape
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 23, 0, Math.PI * 2)
    ctx.stroke()

    this.cache.set(type, await createImageBitmap(offscreen))
  }

  drawHat(
    ctx: CanvasRenderingContext2D,
    type: HatType,
    cx: number,
    cy: number,
    alpha = 1,
  ): void {
    const bitmap = this.cache.get(type)
    if (!bitmap) {
      this.drawHatFallback(ctx, type, cx, cy)
      return
    }
    const prev = ctx.globalAlpha
    ctx.globalAlpha = alpha
    ctx.drawImage(bitmap, cx - this.size / 2, cy - this.size / 2)
    ctx.globalAlpha = prev
  }

  /** Simple colored circle fallback used before prerender() completes */
  private drawHatFallback(
    ctx: CanvasRenderingContext2D,
    type: HatType,
    cx: number,
    cy: number,
  ): void {
    const colors = ['#333','#8B5E1A','#C8A030','#5500aa','#CC2222','#006B7D','#228B22']
    ctx.fillStyle = colors[type] ?? '#888'
    ctx.beginPath()
    ctx.arc(cx, cy, this.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  isReady(): boolean {
    return this.cache.size === HAT_TYPE_COUNT
  }
}
