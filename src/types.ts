/**
 * Numeric identifiers for each hat variety used as both grid tiles and
 * projectiles. Values are assigned explicitly so they can be used as
 * zero-based array indices into sprite/colour lookup tables.
 */
export const enum HatType {
  /** Classic formal top hat. Index 0. */
  TOP_HAT = 0,
  /** Wide-brimmed felt fedora. Index 1. */
  FEDORA = 1,
  /** Broad-brimmed cowboy hat. Index 2. */
  COWBOY = 2,
  /** Pointed witch's hat. Index 3. */
  WITCH = 3,
  /** Curved-brim baseball cap. Index 4. */
  BASEBALL_CAP = 4,
  /** Flat-topped French beret. Index 5. */
  BERET = 5,
  /** Beanie with a spinning propeller on top. Index 6. */
  PROPELLER = 6,
}

/**
 * Total number of distinct hat types. Should equal the highest
 * {@link HatType} ordinal plus one so that random selection and
 * array allocations stay in sync with the enum.
 */
export const HAT_TYPE_COUNT = 7

/**
 * Represents the current high-level state of the game loop.
 *
 * - `'menu'`    – title/start screen is shown; gameplay is not active.
 * - `'playing'` – the game loop is running and accepting input.
 * - `'paused'`  – the game loop is suspended; board state is preserved.
 * - `'won'`     – the player cleared all hats; victory screen is shown.
 * - `'lost'`    – hats reached the danger row; game-over screen is shown.
 */
export type GamePhase = 'menu' | 'playing' | 'paused' | 'won' | 'lost'

/**
 * A discrete cell address in the hexagonal hat grid.
 * Row 0 is at the top of the play area; column 0 is on the left.
 */
export interface GridPos {
  /** Zero-based row index, increasing downward. */
  row: number
  /** Zero-based column index within the row, increasing rightward. */
  col: number
}

/**
 * A hat that occupies a specific cell in the stationary grid.
 */
export interface GridHat {
  /** Visual and matching identity of this hat. */
  type: HatType
  /** Cell address inside the hex grid. */
  pos: GridPos
}

/**
 * A hat that has been dislodged from the grid and is currently
 * animating off-screen under simulated gravity.
 */
export interface FallingHat {
  /** Visual identity of the hat (used to pick the correct sprite). */
  type: HatType
  /** Horizontal position of the hat centre, in px from the left canvas edge. */
  x: number
  /** Vertical position of the hat centre, in px from the top canvas edge. */
  y: number
  /** Horizontal velocity component, in px per frame. */
  vx: number
  /** Vertical velocity component, in px per frame (positive = downward). */
  vy: number
  /** Alpha transparency in the range [0, 1]; hats fade out as they fall. */
  opacity: number
}

// ---------------------------------------------------------------------------
// Canvas dimensions
// ---------------------------------------------------------------------------

/** Width of the game canvas in px. */
export const CANVAS_WIDTH = 600

/** Height of the game canvas in px. */
export const CANVAS_HEIGHT = 700

// ---------------------------------------------------------------------------
// Hat sizing
// ---------------------------------------------------------------------------

/**
 * Radius of a single hat tile in px (centre to edge of its bounding circle).
 * Used for collision detection and grid-position calculations.
 */
export const HAT_RADIUS = 24

/**
 * Diameter of a single hat tile in px. Equal to {@link HAT_RADIUS} * 2.
 * Convenience constant used when both width and height of a tile are needed.
 */
export const HAT_DIAMETER = HAT_RADIUS * 2

// ---------------------------------------------------------------------------
// Grid layout
// ---------------------------------------------------------------------------

/**
 * Number of hat columns in the widest row of the hexagonal grid.
 * Odd-indexed rows are offset by half a diameter, so they contain one fewer
 * hat, but this value represents the maximum column count.
 */
export const GRID_COLS = 13

/**
 * Vertical distance between the centres of adjacent rows in the hex grid, in px.
 * Derived from {@link HAT_DIAMETER} scaled by sin(60°) ≈ 0.866 so that
 * circles in neighbouring rows touch without overlapping.
 * Rounded to the nearest integer to avoid sub-pixel misalignment.
 */
export const ROW_HEIGHT = Math.round(HAT_DIAMETER * 0.866) // sin(60°) ≈ 41.6

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

/**
 * Travel speed of a fired projectile, in px per frame.
 * Applied uniformly along the projectile's direction vector each update tick.
 */
export const PROJECTILE_SPEED = 8

/**
 * Y-coordinate threshold (in px from the top canvas edge) below which the
 * bottom-most row of grid hats is considered to have reached the danger zone.
 * Crossing this line triggers a game-over condition.
 */
export const DANGER_ROW_Y = CANVAS_HEIGHT - 130

/**
 * Horizontal centre of the shooter cannon, in px from the left canvas edge.
 * Defaults to the horizontal midpoint of the canvas.
 */
export const SHOOTER_X = CANVAS_WIDTH / 2

/**
 * Vertical position of the shooter cannon, in px from the top canvas edge.
 * Placed near the bottom of the canvas so the player fires upward.
 */
export const SHOOTER_Y = CANVAS_HEIGHT - 55

/**
 * Maximum allowed aim angle from the vertical (straight up = 0°), in degrees.
 * The shooter is clamped to the range [-{@link MAX_ANGLE_DEG}, +{@link MAX_ANGLE_DEG}]
 * so that projectiles always travel upward and cannot be fired sideways or downward.
 */
export const MAX_ANGLE_DEG = 78

/**
 * Minimum number of same-type hats that must form a connected group for them
 * to be removed from the grid. Groups smaller than this are left in place.
 */
export const MIN_MATCH_COUNT = 3

/**
 * Number of hat rows pre-populated on the grid when a new game begins.
 */
export const INITIAL_ROWS = 8
