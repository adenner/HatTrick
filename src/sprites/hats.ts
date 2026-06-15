import { HatType } from '../types'

/**
 * A single filled (and optionally stroked) path layer within a hat sprite.
 *
 * Hat sprites are built by compositing multiple `SvgLayer` paths in order,
 * back to front, on top of each other.  All path coordinates are defined in
 * a 48×48 viewBox centred at `(0, 0)` (so the hat occupies roughly the
 * region `[-24, 24] × [-26, 16]`).  {@link HatRenderer} scales this design
 * space uniformly from radius 24 to the runtime `HAT_RADIUS` before
 * blitting each layer onto an `OffscreenCanvas`.
 */
export interface SvgLayer {
  /**
   * SVG path data string (`d` attribute).  Coordinates are relative to the
   * 48×48 viewBox centred at the origin — positive Y is downward (canvas
   * convention).
   */
  d: string

  /**
   * CSS fill colour applied to the closed path interior.  Any valid CSS
   * colour string is accepted (hex, `rgb()`, `rgba()`, named colour, etc.).
   * Use `'none'` for an unfilled (outline-only) path.
   */
  fill: string

  /**
   * Optional CSS stroke colour drawn along the path outline.  When omitted
   * no stroke is applied to this layer.
   */
  stroke?: string

  /**
   * Width of the stroke in viewBox units.  Only meaningful when {@link stroke}
   * is also set; ignored otherwise.
   */
  strokeWidth?: number
}

/**
 * Complete visual definition for a single hat type.
 *
 * A sprite is a stack of {@link SvgLayer} path layers drawn in array order
 * (index 0 is the bottommost / background layer).  At startup,
 * {@link HatRenderer} rasterises each `HatSprite` onto a dedicated
 * `OffscreenCanvas` and caches the result as an `ImageBitmap`.
 */
export interface HatSprite {
  /**
   * Ordered list of SVG path layers composited back-to-front to produce the
   * final hat image.  At least one layer is required.
   */
  layers: SvgLayer[]

  /**
   * Hex colour string used for the canvas shadow glow that is applied when a
   * hat is highlighted by the targeting-assist overlay.  Should roughly match
   * the dominant colour of the hat sprite so the glow looks natural.
   */
  glowColor: string

  /**
   * Human-readable display name for this hat type (e.g. `'Top Hat'`).
   * Used in debug tooling and any future UI that names hat varieties.
   */
  label: string
}

/**
 * Sprite definitions for all seven hat types in the game.
 *
 * Keyed by {@link HatType} enum value so that any subsystem can retrieve a
 * sprite with a simple indexed lookup:
 * ```ts
 * const sprite = HAT_SPRITES[HatType.FEDORA]
 * ```
 *
 * All paths are designed for a 48×48 viewBox centred at `(0, 0)`.
 * Positive Y is down (canvas convention).  {@link HatRenderer} scales each
 * sprite from design radius 24 to the runtime `HAT_RADIUS` before caching
 * the result as an `ImageBitmap` for efficient per-frame `drawImage` calls.
 */
export const HAT_SPRITES: Record<HatType, HatSprite> = {
  [HatType.TOP_HAT]: {
    label: 'Top Hat',
    glowColor: '#888888',
    layers: [
      // Wide brim
      { d: 'M -22 8 L 22 8 L 22 13 L -22 13 Z', fill: '#222222', stroke: '#555555', strokeWidth: 1 },
      // Tall crown
      { d: 'M -10 -22 L 10 -22 L 10 8 L -10 8 Z', fill: '#111111', stroke: '#444444', strokeWidth: 1 },
      // Hat band
      { d: 'M -10 3 L 10 3 L 10 8 L -10 8 Z', fill: '#cc4400' },
      // Crown top highlight
      { d: 'M -10 -22 L 10 -22 L 10 -18 L -10 -18 Z', fill: '#333333' },
    ],
  },

  [HatType.FEDORA]: {
    label: 'Fedora',
    glowColor: '#c8a020',
    layers: [
      // Brim
      { d: 'M -21 6 Q -21 14 0 14 Q 21 14 21 6 L 21 8 Q 21 16 0 16 Q -21 16 -21 8 Z', fill: '#8B5E1A', stroke: '#6b4510', strokeWidth: 1 },
      // Crown body (rounded)
      { d: 'M -11 6 Q -13 -8 -8 -18 Q -4 -24 0 -24 Q 4 -24 8 -18 Q 13 -8 11 6 Z', fill: '#A0701F', stroke: '#7a5518', strokeWidth: 1 },
      // Pinch dent at top
      { d: 'M -4 -22 Q 0 -26 4 -22 Q 2 -18 0 -18 Q -2 -18 -4 -22 Z', fill: '#8B5E1A' },
      // Hat band
      { d: 'M -11 4 Q 0 2 11 4 L 11 7 Q 0 5 -11 7 Z', fill: '#2244aa' },
    ],
  },

  [HatType.COWBOY]: {
    label: 'Cowboy Hat',
    glowColor: '#e8c040',
    layers: [
      // Wide curved brim
      { d: 'M -24 8 Q -20 18 -10 16 L 10 16 Q 20 18 24 8 L 22 6 Q 18 15 10 13 L -10 13 Q -18 15 -22 6 Z', fill: '#C8A030', stroke: '#a07820', strokeWidth: 1 },
      // Crown
      { d: 'M -9 6 Q -12 -4 -6 -16 Q -2 -22 0 -22 Q 2 -22 6 -16 Q 12 -4 9 6 Z', fill: '#D4AE3A', stroke: '#b09028', strokeWidth: 1 },
      // Crown crease
      { d: 'M -3 -20 Q 0 -24 3 -20 Q 1 -14 0 -14 Q -1 -14 -3 -20 Z', fill: '#b89028' },
      // Band
      { d: 'M -9 4 Q 0 2 9 4 L 9 7 Q 0 5 -9 7 Z', fill: '#8B2200' },
    ],
  },

  [HatType.WITCH]: {
    label: 'Witch Hat',
    glowColor: '#aa44ff',
    layers: [
      // Brim
      { d: 'M -22 8 Q -22 15 0 15 Q 22 15 22 8 L 20 7 Q 20 13 0 13 Q -20 13 -20 7 Z', fill: '#3d0066', stroke: '#6600aa', strokeWidth: 1 },
      // Cone body
      { d: 'M -11 8 L 0 -24 L 11 8 Z', fill: '#5500aa', stroke: '#7700cc', strokeWidth: 1 },
      // Belt buckle
      { d: 'M -4 4 L 4 4 L 4 9 L -4 9 Z', fill: '#ffd700', stroke: '#cc9900', strokeWidth: 1 },
      { d: 'M -2 6 L 2 6 L 2 7 L -2 7 Z', fill: '#3d0066' },
      // Cone highlight stripe
      { d: 'M -2 -5 L 0 -24 L 2 -5 Q 1 -3 0 -3 Q -1 -3 -2 -5 Z', fill: '#7700cc', stroke: 'none' },
    ],
  },

  [HatType.BASEBALL_CAP]: {
    label: 'Baseball Cap',
    glowColor: '#ff4444',
    layers: [
      // Main dome
      { d: 'M -14 6 Q -16 -2 -10 -16 Q -4 -24 0 -24 Q 4 -24 10 -16 Q 16 -2 14 6 Z', fill: '#CC2222', stroke: '#aa1111', strokeWidth: 1 },
      // Bill (visor) pointing right
      { d: 'M 0 6 Q 14 6 24 10 Q 26 12 24 13 Q 16 10 0 10 Z', fill: '#aa1111', stroke: '#880000', strokeWidth: 1 },
      // Seam lines
      { d: 'M 0 -24 Q 0 6 0 6', fill: 'none', stroke: '#aa1111', strokeWidth: 1 },
      { d: 'M -10 -16 Q -5 -5 0 6', fill: 'none', stroke: '#aa1111', strokeWidth: 1 },
      { d: 'M 10 -16 Q 5 -5 0 6', fill: 'none', stroke: '#aa1111', strokeWidth: 1 },
      // Button on top
      { d: 'M -2 -22 Q 0 -26 2 -22 Q 0 -20 -2 -22 Z', fill: '#881111' },
      // Sweatband
      { d: 'M -14 6 Q 0 4 14 6 L 14 8 Q 0 6 -14 8 Z', fill: '#882222' },
    ],
  },

  [HatType.BERET]: {
    label: 'Beret',
    glowColor: '#00aacc',
    layers: [
      // Main circular body (slightly tilted ellipse)
      { d: 'M -20 2 Q -18 -20 0 -22 Q 18 -20 20 2 Q 16 10 0 11 Q -16 10 -20 2 Z', fill: '#006B7D', stroke: '#005566', strokeWidth: 1 },
      // Rim band
      { d: 'M -18 6 Q 0 10 18 6 L 20 8 Q 0 12 -20 8 Z', fill: '#004455' },
      // Stem
      { d: 'M -1 -22 Q 0 -26 1 -22 L 1 -20 Q 0 -18 -1 -20 Z', fill: '#004455' },
      // Highlight
      { d: 'M -10 -14 Q -6 -20 0 -20 Q 2 -16 -4 -10 Q -8 -10 -10 -14 Z', fill: '#0088aa', stroke: 'none' },
    ],
  },

  [HatType.PROPELLER]: {
    label: 'Propeller Hat',
    glowColor: '#44cc44',
    layers: [
      // Beanie dome
      { d: 'M -13 6 Q -15 -4 -8 -16 Q -3 -22 0 -22 Q 3 -22 8 -16 Q 15 -4 13 6 Z', fill: '#228B22', stroke: '#1a6e1a', strokeWidth: 1 },
      // Color panels
      { d: 'M 0 -22 Q 4 -14 8 -16 Q 4 -6 0 6 Q 0 -4 0 -22 Z', fill: '#ff6600' },
      { d: 'M 0 -22 Q -4 -14 -8 -16 Q -4 -6 0 6 Q 0 -4 0 -22 Z', fill: '#ffcc00' },
      // Brim
      { d: 'M -14 5 Q 0 3 14 5 L 14 8 Q 0 6 -14 8 Z', fill: '#1a6e1a', stroke: '#155515', strokeWidth: 1 },
      // Propeller hub
      { d: 'M -2 -22 Q 0 -26 2 -22 Q 2 -20 0 -20 Q -2 -20 -2 -22 Z', fill: '#888888' },
      // Propeller blades
      { d: 'M 0 -24 Q 8 -28 10 -24 Q 6 -21 0 -22 Z', fill: '#cc0000', stroke: '#880000', strokeWidth: 0.5 },
      { d: 'M 0 -24 Q -8 -28 -10 -24 Q -6 -21 0 -22 Z', fill: '#0044cc', stroke: '#002288', strokeWidth: 0.5 },
      { d: 'M 0 -22 Q 8 -18 10 -22 Q 6 -25 0 -24 Z', fill: '#cc0000', stroke: '#880000', strokeWidth: 0.5 },
      { d: 'M 0 -22 Q -8 -18 -10 -22 Q -6 -25 0 -24 Z', fill: '#0044cc', stroke: '#002288', strokeWidth: 0.5 },
    ],
  },
}
