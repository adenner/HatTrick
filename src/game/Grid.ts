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

export class Grid {
  private cells: Map<string, HatType> = new Map()

  private key(pos: GridPos): string {
    return `${pos.row},${pos.col}`
  }

  private parseKey(k: string): GridPos {
    const [row, col] = k.split(',').map(Number)
    return { row, col }
  }

  /** Max cols for a given row (odd rows are 1 narrower due to offset) */
  colCount(row: number): number {
    return row % 2 === 0 ? GRID_COLS : GRID_COLS - 1
  }

  isValidPos(pos: GridPos): boolean {
    return pos.row >= 0 && pos.col >= 0 && pos.col < this.colCount(pos.row)
  }

  getHat(pos: GridPos): HatType | null {
    const v = this.cells.get(this.key(pos))
    return v !== undefined ? v : null
  }

  setHat(pos: GridPos, type: HatType): void {
    this.cells.set(this.key(pos), type)
  }

  removeHat(pos: GridPos): void {
    this.cells.delete(this.key(pos))
  }

  hasHat(pos: GridPos): boolean {
    return this.cells.has(this.key(pos))
  }

  getAllHats(): GridHat[] {
    const result: GridHat[] = []
    for (const [k, type] of this.cells) {
      result.push({ pos: this.parseKey(k), type })
    }
    return result
  }

  /** Iterate hats without allocating an intermediate array — use in hot paths */
  *iterHats(): Generator<GridHat> {
    for (const [k, type] of this.cells) {
      yield { pos: this.parseKey(k), type }
    }
  }

  clear(): void {
    this.cells.clear()
  }

  /** Convert grid position to canvas pixel center coordinates */
  toPixel(pos: GridPos): { x: number; y: number } {
    // Odd rows are offset right by one hat radius
    const offsetX = pos.row % 2 === 1 ? HAT_RADIUS : 0
    const x = HAT_RADIUS + pos.col * HAT_DIAMETER + offsetX
    const y = HAT_RADIUS + pos.row * ROW_HEIGHT
    return { x, y }
  }

  /**
   * Snap a canvas pixel coordinate to the nearest valid, unoccupied grid cell.
   * Searches rows around the expected row to handle between-row positions.
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
   * Returns all valid adjacent grid positions for hex offset coordinates.
   *
   * Even rows: diagonals go to (r±1, c-1) and (r±1, c)
   * Odd rows:  diagonals go to (r±1, c)   and (r±1, c+1)
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

  /** BFS flood-fill: find all connected hats of the same type starting at pos */
  findMatches(startPos: GridPos, type: HatType): Set<string> {
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

    return visited.size >= MIN_MATCH_COUNT ? visited : new Set<string>()
  }

  /**
   * BFS from all row-0 hats to find the connected component.
   * Returns keys of all hats NOT reachable from the ceiling (floating).
   * Call this AFTER removing matched hats.
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

  /** Remove a set of hats by their key strings, return their GridHat data */
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

  /** Lowest occupied row index (highest Y value) */
  getLowestRow(): number {
    let max = -1
    for (const k of this.cells.keys()) {
      const { row } = this.parseKey(k)
      if (row > max) max = row
    }
    return max
  }

  /** Y coordinate of the bottom edge of the lowest occupied row */
  getLowestOccupiedY(): number {
    const row = this.getLowestRow()
    if (row < 0) return 0
    return this.toPixel({ row, col: 0 }).y + HAT_RADIUS
  }

  /** Populate the grid with random hats for the initial game state */
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

  /** Find the nearest free adjacent cell to a hit position, closest to (px, py) */
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

  get size(): number {
    return this.cells.size
  }
}
