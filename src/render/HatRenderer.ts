import { HatType, HAT_TYPE_COUNT, HAT_RADIUS } from '../types'
import { HAT_SPRITES, SvgLayer } from '../sprites/hats'

/**
 * Renders a single hat sprite by filling and optionally stroking each of its
 * named SVG path layers onto an `OffscreenCanvasRenderingContext2D`.
 *
 * This is a private helper consumed only by {@link HatRenderer.prerenderOne}.
 *
 * @param ctx    - The 2D rendering context to draw into.
 * @param layers - Ordered array of SVG layer descriptors (path data, fill color,
 *   optional stroke color, and optional stroke width) to paint from back to front.
 */
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

/**
 * Pre-renders every hat type into GPU-resident `ImageBitmap` objects using the
 * browser's `OffscreenCanvas` API, then provides fast per-frame drawing via
 * {@link drawHat}.
 *
 * ## Pre-render strategy
 * Hat sprites are defined as layered SVG paths in `sprites/hats.ts`. Drawing
 * them with `Path2D` on every frame is too expensive at 60 fps when dozens of
 * hats are on screen. `HatRenderer` solves this by rasterising each hat type
 * exactly once at startup:
 *
 * 1. An `OffscreenCanvas` sized `radius * 3` is created for each `HatType`.
 * 2. The SVG layers, glow shadow, and outline circle are drawn onto it.
 * 3. `createImageBitmap()` transfers the result to a GPU texture (`ImageBitmap`).
 * 4. Subsequent calls to {@link drawHat} issue a single `drawImage()` call,
 *    which the browser composites in hardware with no path re-evaluation.
 *
 * Call {@link prerender} once (before the first game frame) and await its
 * resolution before starting the render loop. If {@link drawHat} is called
 * before pre-rendering is complete for a given type, a simple colored circle
 * fallback is drawn instead.
 *
 * Call {@link destroy} when the game is torn down to release GPU memory.
 */
export class HatRenderer {
  private cache = new Map<HatType, ImageBitmap>()
  private readonly radius: number
  /** Size of each pre-rendered sprite canvas (with padding) */
  private readonly size: number

  /**
   * Creates a `HatRenderer` configured for the given hat radius.
   *
   * @param radius - The logical radius of a hat in canvas pixels.
   *   Defaults to the global `HAT_RADIUS` constant.
   */
  constructor(radius: number = HAT_RADIUS) {
    this.radius = radius
    this.size = radius * 3  // generous padding for strokes/overhangs
  }

  /**
   * Pre-renders all hat types in parallel and populates the internal bitmap
   * cache. Resolves once every `ImageBitmap` has been created.
   *
   * This method should be awaited before starting the game render loop so that
   * {@link drawHat} can use the fast `drawImage` path for every hat type.
   * It is safe to call multiple times, though doing so after initial load
   * will redundantly recreate and overwrite the existing bitmaps.
   *
   * @returns A `Promise` that resolves when all hat types have been rasterised.
   */
  async prerender(): Promise<void> {
    const promises: Array<Promise<void>> = []
    for (let t = 0; t < HAT_TYPE_COUNT; t++) {
      const type = t as HatType
      promises.push(this.prerenderOne(type))
    }
    await Promise.all(promises)
  }

  /**
   * Rasterises a single hat type onto an `OffscreenCanvas` and stores the
   * resulting `ImageBitmap` in the cache.
   *
   * The canvas origin is translated to the center and scaled so that the
   * sprite's design radius of 24px maps to the configured `radius`.
   * A glow shadow, the hat's SVG layers, and a subtle outline circle are
   * composited before the bitmap is committed to the GPU.
   *
   * @param type - The hat type to pre-render.
   */
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

  /**
   * Draws a hat of the given type centered at `(cx, cy)` on the provided
   * canvas context.
   *
   * If the `ImageBitmap` for `type` has already been pre-rendered it is
   * composited with a single `drawImage` call at the requested `alpha`.
   * If the bitmap is not yet available (i.e., {@link prerender} has not
   * completed for this type), a plain colored circle fallback is painted
   * instead with no alpha support.
   *
   * @param ctx   - The 2D rendering context of the main game canvas.
   * @param type  - The hat type to draw.
   * @param cx    - The x canvas pixel coordinate of the hat's center.
   * @param cy    - The y canvas pixel coordinate of the hat's center.
   * @param alpha - Opacity in the range `[0, 1]`. Defaults to `1` (fully opaque).
   *   Ignored when the fallback path is used.
   */
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
    ctx.fillStyle = HAT_SPRITES[type]?.glowColor ?? '#888'
    ctx.beginPath()
    ctx.arc(cx, cy, this.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * Returns `true` when all hat types have been successfully pre-rendered and
   * their `ImageBitmap` objects are available in the cache.
   *
   * Use this to gate first-frame rendering or to show a loading indicator
   * while {@link prerender} is still in progress.
   *
   * @returns `true` if every `HatType` has a cached bitmap, `false` otherwise.
   */
  isReady(): boolean {
    return this.cache.size === HAT_TYPE_COUNT
  }

  /**
   * Releases all cached `ImageBitmap` GPU textures and clears the internal
   * cache.
   *
   * Call this when the game is unmounted or the renderer is no longer needed
   * to avoid GPU memory leaks. After calling `destroy()`, {@link drawHat}
   * will fall back to the plain circle renderer until {@link prerender} is
   * called again.
   */
  destroy(): void {
    for (const bmp of this.cache.values()) bmp.close()
    this.cache.clear()
  }
}
