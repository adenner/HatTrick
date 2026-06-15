import {
  HatType,
  HAT_TYPE_COUNT,
  GridPos,
  GridHat,
  HAT_RADIUS,
  HAT_DIAMETER,
  GRID_COLS,
  ROW_HEIGHT,
  MIN_MATCH_COUNT,
} from '../types'

/**
 * Manages the hat grid for a HatTrick game, storing and querying the position
 * and type of every hat currently placed on the playfield.
 *
 * ## Coordinate system
 * The grid uses a **hex offset** layout:
 * - Rows are numbered top-to-bottom, starting at 0 (the ceiling row).
 * - Columns are numbered left-to-right within each row.
 * - Even rows have `GRID_COLS` columns; odd rows have `GRID_COLS - 1` columns
 *   and are shifted right by one `HAT_RADIUS` to produce the interlocking hex
 *   pattern.
 * - `toPixel()` converts a `{row, col}` grid position to the canvas pixel
 *   center of that cell.
 *
 * Internally, positions are stored in a `Map<string, HatType>` keyed by
 * `"row,col"` strings so that lookups and deletions are O(1).
 */
export class Grid {
  private cells: Map<string, HatType> = new Map()

  private key(pos: GridPos): string {
    return `${pos.row},${pos.col}`
  }

  private parseKey(k: string): GridPos {
    const [row, col] = k.split(',').map(Number)
    return { row, col }
  }

  /**
   * Returns the number of columns in the given row.
   *
   * Even rows span the full `GRID_COLS` width; odd rows are one column
   * narrower because they are offset right by half a cell to create the
   * hex interlocking pattern.
   *
   * @param row - Zero-based row index.
   * @returns The column count for that row.
   */
  colCount(row: number): number {
    return row % 2 === 0 ? GRID_COLS : GRID_COLS - 1
  }

  /**
   * Returns `true` if `pos` refers to a cell that exists within the grid
   * bounds (non-negative row, column within the row's column count).
   *
   * @param pos - The grid position to validate.
   * @returns `true` when the position is inside the playfield, `false` otherwise.
   */
  isValidPos(pos: GridPos): boolean {
    return pos.row >= 0 && pos.col >= 0 && pos.col < this.colCount(pos.row)
  }

  /**
   * Retrieves the hat type at the given grid position.
   *
   * @param pos - The grid position to query.
   * @returns The `HatType` occupying that cell, or `null` if the cell is empty.
   */
  getHat(pos: GridPos): HatType | null {
    const v = this.cells.get(this.key(pos))
    return v !== undefined ? v : null
  }

  /**
   * Places a hat of the given type at the specified grid position,
   * overwriting any hat that was previously there.
   *
   * @param pos  - The grid position to fill.
   * @param type - The hat type to store at that position.
   */
  setHat(pos: GridPos, type: HatType): void {
    this.cells.set(this.key(pos), type)
  }

  /**
   * Removes the hat at the given grid position.
   * If the cell is already empty this is a no-op.
   *
   * @param pos - The grid position to clear.
   */
  removeHat(pos: GridPos): void {
    this.cells.delete(this.key(pos))
  }

  /**
   * Returns `true` if a hat occupies the given grid position.
   *
   * @param pos - The grid position to test.
   * @returns `true` when a hat is present, `false` when the cell is empty.
   */
  hasHat(pos: GridPos): boolean {
    return this.cells.has(this.key(pos))
  }

  /**
   * Collects every hat currently on the grid into an array.
   *
   * Allocates a new array on each call. For hot paths where allocation
   * matters, prefer {@link iterHats}.
   *
   * @returns An array of `GridHat` objects, each containing a position and
   *   hat type. Order is unspecified (reflects `Map` insertion order).
   */
  getAllHats(): GridHat[] {
    const result: GridHat[] = []
    for (const [k, type] of this.cells) {
      result.push({ pos: this.parseKey(k), type })
    }
    return result
  }

  /**
   * Lazily yields every hat currently on the grid as a `GridHat` value.
   *
   * Unlike {@link getAllHats}, no intermediate array is allocated, making
   * this preferable in hot paths such as collision detection loops.
   *
   * @yields `GridHat` objects in `Map` insertion order.
   */
  *iterHats(): Generator<GridHat> {
    for (const [k, type] of this.cells) {
      yield { pos: this.parseKey(k), type }
    }
  }

  /**
   * Removes all hats from the grid, resetting it to an empty state.
   */
  clear(): void {
    this.cells.clear()
  }

  /**
   * Converts a grid position to its canvas pixel center coordinates.
   *
   * Odd rows are shifted right by `HAT_RADIUS` to produce the hex offset.
   * The top-left corner of the canvas is `(0, 0)`; Y increases downward.
   *
   * @param pos - The grid position to convert.
   * @returns The `{x, y}` pixel coordinates of the cell's center.
   */
  toPixel(pos: GridPos): { x: number; y: number } {
    // Odd rows are offset right by one hat radius
    const offsetX = pos.row % 2 === 1 ? HAT_RADIUS : 0
    const x = HAT_RADIUS + pos.col * HAT_DIAMETER + offsetX
    const y = HAT_RADIUS + pos.row * ROW_HEIGHT
    return { x, y }
  }

  /**
   * Snaps a canvas pixel coordinate to the nearest valid, unoccupied grid cell.
   *
   * Searches the expected row and the two surrounding rows to correctly handle
   * positions that fall between rows. Returns the closest empty cell by
   * Euclidean distance.
   *
   * @param px - The x canvas pixel coordinate to snap.
   * @param py - The y canvas pixel coordinate to snap.
   * @returns The nearest empty `GridPos`, or `null` if no empty cell was found
   *   in the search range.
   */
  snapToGrid(px: number, py: number): GridPos | null {
    const approxRow = Math.round((py - HAT_RADIUS) / ROW_HEIGHT)
    const minRow = Math.max(0, approxRow - 1)
    const maxRow = approxRow + 2

    let best: GridPos | null = null
    let bestDist = Infinity

    for (let row = minRow; row <= maxRow; row++) {
      const cols = this.colCount(row)
      for (let col = 0; col < cols; col++) {
        const pos = { row, col }
        if (this.hasHat(pos)) continue
        const { x, y } = this.toPixel(pos)
        const d = Math.hypot(px - x, py - y)
        if (d < bestDist) {
          bestDist = d
          best = pos
        }
      }
    }
    return best
  }

  /**
   * Returns all valid grid positions adjacent to `pos` in the hex offset layout.
   *
   * Each cell has up to six neighbours: two horizontal and four diagonal.
   * The diagonal offsets depend on whether the row is even or odd:
   * - **Even rows**: diagonals go to `(r±1, c-1)` and `(r±1, c)`.
   * - **Odd rows**:  diagonals go to `(r±1, c)` and `(r±1, c+1)`.
   *
   * Positions that fall outside the grid bounds are excluded from the result.
   *
   * @param pos - The grid position whose neighbours are requested.
   * @returns An array of valid adjacent `GridPos` values (0–6 entries).
   */
  getAdjacentPositions(pos: GridPos): GridPos[] {
    const { row: r, col: c } = pos
    const candidates: GridPos[] = [
      { row: r, col: c - 1 },
      { row: r, col: c + 1 },
    ]

    if (r % 2 === 0) {
      // Even row
      candidates.push(
        { row: r - 1, col: c - 1 },
        { row: r - 1, col: c },
        { row: r + 1, col: c - 1 },
        { row: r + 1, col: c },
      )
    } else {
      // Odd row
      candidates.push(
        { row: r - 1, col: c },
        { row: r - 1, col: c + 1 },
        { row: r + 1, col: c },
        { row: r + 1, col: c + 1 },
      )
    }

    return candidates.filter(p => this.isValidPos(p))
  }

  /**
   * BFS flood-fill that finds the connected group of same-type hats starting
   * at `startPos`, but only returns the group if it meets the minimum match
   * size threshold (`MIN_MATCH_COUNT`).
   *
   * Use this method to determine whether a newly landed hat triggers a removal.
   * For a preview that always shows the full group regardless of size, use
   * {@link findMatchesAll}.
   *
   * @param startPos - The grid position from which the flood-fill begins.
   * @param type     - The hat type to match against neighbours.
   * @returns A `Set` of key strings for all matched positions when the group
   *   is large enough, or an empty `Set` if the group is below the threshold.
   */
  findMatches(startPos: GridPos, type: HatType): Set<string> {
    const group = this.findMatchesAll(startPos, type)
    return group.size >= MIN_MATCH_COUNT ? group : new Set<string>()
  }

  /**
   * BFS flood-fill that returns the complete connected group of same-type hats
   * starting at `startPos`, regardless of group size.
   *
   * This is the underlying implementation used by {@link findMatches}. It is
   * exposed separately so that the targeting preview can highlight the full
   * connected group even when it is smaller than `MIN_MATCH_COUNT`.
   *
   * @param startPos - The grid position from which the flood-fill begins.
   * @param type     - The hat type to match against neighbours.
   * @returns A `Set` of key strings (in `"row,col"` format) for every position
   *   in the connected same-type group.
   */
  findMatchesAll(startPos: GridPos, type: HatType): Set<string> {
    const visited = new Set<string>()
    const queue: GridPos[] = [startPos]
    visited.add(this.key(startPos))

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const adj of this.getAdjacentPositions(current)) {
        const k = this.key(adj)
        if (!visited.has(k) && this.getHat(adj) === type) {
          visited.add(k)
          queue.push(adj)
        }
      }
    }

    return visited
  }

  /**
   * Identifies hats that are no longer connected to the ceiling (row 0).
   *
   * Performs a BFS starting from every hat in row 0 to find the fully
   * connected component. Any hat not reachable from row 0 is considered
   * "floating" and should fall from the playfield.
   *
   * This method should be called **after** matched hats have already been
   * removed so that the connectivity check reflects the updated grid state.
   *
   * @returns A `Set` of key strings (in `"row,col"` format) for all hats
   *   that have no path back to the ceiling row.
   */
  findDisconnected(): Set<string> {
    const connected = new Set<string>()
    const queue: GridPos[] = []

    // Seed from every hat in row 0
    const cols0 = this.colCount(0)
    for (let c = 0; c < cols0; c++) {
      const pos = { row: 0, col: c }
      if (this.hasHat(pos)) {
        const k = this.key(pos)
        connected.add(k)
        queue.push(pos)
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const adj of this.getAdjacentPositions(current)) {
        const k = this.key(adj)
        if (!connected.has(k) && this.hasHat(adj)) {
          connected.add(k)
          queue.push(adj)
        }
      }
    }

    const disconnected = new Set<string>()
    for (const k of this.cells.keys()) {
      if (!connected.has(k)) {
        disconnected.add(k)
      }
    }
    return disconnected
  }

  /**
   * Removes hats identified by their key strings and returns their data.
   *
   * This is typically called with the result of {@link findMatches} or
   * {@link findDisconnected} to batch-remove hats after a match or a fall.
   *
   * @param keys - A `Set` of `"row,col"` key strings identifying hats to remove.
   * @returns An array of `GridHat` objects describing each removed hat's
   *   position and type, in iteration order of `keys`.
   */
  removeByKeys(keys: Set<string>): GridHat[] {
    const removed: GridHat[] = []
    for (const k of keys) {
      const type = this.cells.get(k)
      if (type !== undefined) {
        const pos = this.parseKey(k)
        removed.push({ pos, type })
        this.cells.delete(k)
      }
    }
    return removed
  }

  /**
   * Returns the index of the lowest (highest Y) occupied row in the grid.
   *
   * "Lowest" refers to visual position on screen — i.e., the row with the
   * greatest row index, which is rendered nearest the bottom of the canvas.
   *
   * @returns The maximum occupied row index, or `-1` if the grid is empty.
   */
  getLowestRow(): number {
    let max = -1
    for (const k of this.cells.keys()) {
      const { row } = this.parseKey(k)
      if (row > max) max = row
    }
    return max
  }

  /**
   * Returns the canvas Y coordinate of the bottom edge of the lowest occupied
   * row. This is used to detect when hats have descended too far and the
   * player has lost.
   *
   * @returns The bottom-edge Y pixel coordinate of the lowest occupied row,
   *   or `0` if the grid is empty.
   */
  getLowestOccupiedY(): number {
    const row = this.getLowestRow()
    if (row < 0) return 0
    return this.toPixel({ row, col: 0 }).y + HAT_RADIUS
  }

  /**
   * Populates the grid with randomly typed hats to create the initial game
   * state. Clears any existing hats before filling.
   *
   * Each cell in the first `rows` rows is assigned a uniformly random
   * `HatType` from the full set of available types.
   *
   * @param rows - The number of rows to fill from the top of the grid.
   */
  fillInitialGrid(rows: number): void {
    this.cells.clear()
    for (let row = 0; row < rows; row++) {
      const cols = this.colCount(row)
      for (let col = 0; col < cols; col++) {
        const type = (Math.floor(Math.random() * HAT_TYPE_COUNT)) as HatType
        this.setHat({ row, col }, type)
      }
    }
  }

  /**
   * Finds the best empty grid cell for a projectile hat to land in after
   * colliding with the hat at `hitPos`.
   *
   * Checks all empty cells adjacent to `hitPos` and returns the one whose
   * pixel center is closest to the impact pixel `(px, py)`. If there are no
   * free adjacent cells (e.g., the hit hat is completely surrounded),
   * falls back to {@link snapToGrid} to find the nearest free cell anywhere
   * near the impact point.
   *
   * @param hitPos - The grid position of the hat that was struck.
   * @param px     - The x canvas pixel coordinate of the collision point.
   * @param py     - The y canvas pixel coordinate of the collision point.
   * @returns The `GridPos` of the chosen landing cell, or `null` if no
   *   suitable empty cell could be found.
   */
  findLandingCell(hitPos: GridPos, px: number, py: number): GridPos | null {
    const candidates = this.getAdjacentPositions(hitPos).filter(
      p => !this.hasHat(p)
    )

    if (candidates.length === 0) {
      // Fallback: snap to nearest free cell anywhere near the hit
      return this.snapToGrid(px, py)
    }

    let best: GridPos | null = null
    let bestDist = Infinity
    for (const p of candidates) {
      const { x, y } = this.toPixel(p)
      const d = Math.hypot(px - x, py - y)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    return best
  }

  /**
   * The total number of hats currently occupying the grid.
   */
  get size(): number {
    return this.cells.size
  }
}
