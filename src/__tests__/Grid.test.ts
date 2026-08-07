import { describe, it, expect, beforeEach } from 'vitest'
import { Grid } from '../game/Grid'
import { HatType, HAT_RADIUS, HAT_DIAMETER, ROW_HEIGHT, GRID_COLS } from '../types'

describe('Grid', () => {
  let grid: Grid

  beforeEach(() => {
    grid = new Grid()
  })

  // --- CRUD ---

  describe('setHat / getHat / removeHat', () => {
    it('stores and retrieves a hat', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.TOP_HAT)
      expect(grid.getHat({ row: 0, col: 0 })).toBe(HatType.TOP_HAT)
    })

    it('returns null for empty cell', () => {
      expect(grid.getHat({ row: 1, col: 1 })).toBeNull()
    })

    it('removes a hat', () => {
      grid.setHat({ row: 0, col: 2 }, HatType.FEDORA)
      grid.removeHat({ row: 0, col: 2 })
      expect(grid.getHat({ row: 0, col: 2 })).toBeNull()
    })

    it('hasHat returns correct values', () => {
      grid.setHat({ row: 2, col: 3 }, HatType.WITCH)
      expect(grid.hasHat({ row: 2, col: 3 })).toBe(true)
      expect(grid.hasHat({ row: 2, col: 4 })).toBe(false)
    })
  })

  // --- Column counts ---

  describe('colCount', () => {
    it('even rows have GRID_COLS columns', () => {
      expect(grid.colCount(0)).toBe(GRID_COLS)
      expect(grid.colCount(2)).toBe(GRID_COLS)
    })

    it('odd rows have GRID_COLS - 1 columns', () => {
      expect(grid.colCount(1)).toBe(GRID_COLS - 1)
      expect(grid.colCount(3)).toBe(GRID_COLS - 1)
    })
  })

  // --- isValidPos ---

  describe('isValidPos', () => {
    it('accepts valid positions', () => {
      expect(grid.isValidPos({ row: 0, col: 0 })).toBe(true)
      expect(grid.isValidPos({ row: 0, col: GRID_COLS - 1 })).toBe(true)
      expect(grid.isValidPos({ row: 1, col: GRID_COLS - 2 })).toBe(true)
    })

    it('rejects negative indices', () => {
      expect(grid.isValidPos({ row: -1, col: 0 })).toBe(false)
      expect(grid.isValidPos({ row: 0, col: -1 })).toBe(false)
    })

    it('rejects col >= colCount', () => {
      expect(grid.isValidPos({ row: 0, col: GRID_COLS })).toBe(false)
      expect(grid.isValidPos({ row: 1, col: GRID_COLS - 1 })).toBe(false)
    })
  })

  // --- toPixel ---

  describe('toPixel', () => {
    it('row 0, col 0 lands at (HAT_RADIUS, HAT_RADIUS)', () => {
      const { x, y } = grid.toPixel({ row: 0, col: 0 })
      expect(x).toBe(HAT_RADIUS)
      expect(y).toBe(HAT_RADIUS)
    })

    it('even row col 1 is offset by one diameter', () => {
      const { x } = grid.toPixel({ row: 0, col: 1 })
      expect(x).toBe(HAT_RADIUS + HAT_DIAMETER)
    })

    it('odd row col 0 is offset by HAT_RADIUS horizontally', () => {
      const { x } = grid.toPixel({ row: 1, col: 0 })
      expect(x).toBe(HAT_RADIUS + HAT_RADIUS) // HAT_RADIUS base + HAT_RADIUS offset
    })

    it('row 2 has correct Y', () => {
      const { y } = grid.toPixel({ row: 2, col: 0 })
      expect(y).toBe(HAT_RADIUS + 2 * ROW_HEIGHT)
    })
  })

  // --- getAdjacentPositions ---

  describe('getAdjacentPositions', () => {
    it('even row middle has 6 neighbors', () => {
      const adj = grid.getAdjacentPositions({ row: 2, col: 5 })
      expect(adj.length).toBe(6)
    })

    it('even row col 0 has no left neighbor', () => {
      const adj = grid.getAdjacentPositions({ row: 0, col: 0 })
      const cols = adj.map(p => p.col)
      expect(cols.every(c => c >= 0)).toBe(true)
    })

    it('odd row middle has 6 neighbors', () => {
      const adj = grid.getAdjacentPositions({ row: 1, col: 5 })
      expect(adj.length).toBe(6)
    })

    it('row 0 has no row -1 neighbors', () => {
      const adj = grid.getAdjacentPositions({ row: 0, col: 3 })
      expect(adj.every(p => p.row >= 0)).toBe(true)
    })

    it('even-row diagonals go to (r-1, c-1) and (r-1, c)', () => {
      const adj = grid.getAdjacentPositions({ row: 2, col: 3 })
      const upNeighbors = adj.filter(p => p.row === 1)
      const upCols = upNeighbors.map(p => p.col).sort((a, b) => a - b)
      expect(upCols).toEqual([2, 3])
    })

    it('odd-row diagonals go to (r-1, c) and (r-1, c+1)', () => {
      const adj = grid.getAdjacentPositions({ row: 1, col: 3 })
      const upNeighbors = adj.filter(p => p.row === 0)
      const upCols = upNeighbors.map(p => p.col).sort((a, b) => a - b)
      expect(upCols).toEqual([3, 4])
    })
  })

  // --- findMatches ---

  describe('findMatches', () => {
    it('returns empty set when fewer than 3 connected', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.FEDORA)
      grid.setHat({ row: 0, col: 1 }, HatType.FEDORA)
      const matches = grid.findMatches({ row: 0, col: 0 }, HatType.FEDORA)
      expect(matches.size).toBe(0)
    })

    it('returns all 3 when exactly 3 connected same-type', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.WITCH)
      grid.setHat({ row: 0, col: 1 }, HatType.WITCH)
      grid.setHat({ row: 0, col: 2 }, HatType.WITCH)
      const matches = grid.findMatches({ row: 0, col: 1 }, HatType.WITCH)
      expect(matches.size).toBe(3)
    })

    it('does not cross different hat types', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.COWBOY)
      grid.setHat({ row: 0, col: 1 }, HatType.COWBOY)
      grid.setHat({ row: 0, col: 2 }, HatType.COWBOY)
      grid.setHat({ row: 0, col: 3 }, HatType.FEDORA)
      const matches = grid.findMatches({ row: 0, col: 0 }, HatType.COWBOY)
      expect(matches.size).toBe(3)
      expect([...matches].some(k => k === '0,3')).toBe(false)
    })

    it('finds large cluster', () => {
      for (let c = 0; c < 5; c++) {
        grid.setHat({ row: 0, col: c }, HatType.BASEBALL_CAP)
      }
      const matches = grid.findMatches({ row: 0, col: 2 }, HatType.BASEBALL_CAP)
      expect(matches.size).toBe(5)
    })
  })

  // --- findDisconnected ---

  describe('findDisconnected', () => {
    it('returns empty when all hats connected to ceiling', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.BERET)
      grid.setHat({ row: 1, col: 0 }, HatType.BERET)
      expect(grid.findDisconnected().size).toBe(0)
    })

    it('detects floating hats after bridge removal', () => {
      grid.setHat({ row: 0, col: 3 }, HatType.TOP_HAT)
      grid.setHat({ row: 1, col: 2 }, HatType.FEDORA)
      grid.setHat({ row: 2, col: 2 }, HatType.WITCH)

      expect(grid.findDisconnected().size).toBe(0)

      grid.removeHat({ row: 1, col: 2 })

      const disconnected = grid.findDisconnected()
      expect(disconnected.has('2,2')).toBe(true)
    })
  })

  // --- removeByKeys ---

  describe('removeByKeys', () => {
    it('removes specified hats and returns their data', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.PROPELLER)
      grid.setHat({ row: 0, col: 1 }, HatType.PROPELLER)
      grid.setHat({ row: 0, col: 2 }, HatType.COWBOY)

      const keys = new Set(['0,0', '0,1'])
      const removed = grid.removeByKeys(keys)

      expect(removed.length).toBe(2)
      expect(grid.hasHat({ row: 0, col: 0 })).toBe(false)
      expect(grid.hasHat({ row: 0, col: 1 })).toBe(false)
      expect(grid.hasHat({ row: 0, col: 2 })).toBe(true)
    })
  })

  // --- fillInitialGrid ---

  describe('fillInitialGrid', () => {
    it('creates correct number of hats', () => {
      grid.fillInitialGrid(3)
      expect(grid.size).toBe(13 + 12 + 13)
    })

    it('all hats have valid types', () => {
      grid.fillInitialGrid(4)
      const hats = grid.getAllHats()
      expect(hats.every(h => h.type >= 0 && h.type <= 6)).toBe(true)
    })
  })

  // --- getLowestOccupiedY ---

  describe('getLowestOccupiedY', () => {
    it('returns 0 for empty grid', () => {
      expect(grid.getLowestOccupiedY()).toBe(0)
    })

    it('returns correct Y for populated grid', () => {
      grid.setHat({ row: 3, col: 0 }, HatType.FEDORA)
      const expected = grid.toPixel({ row: 3, col: 0 }).y + HAT_RADIUS
      expect(grid.getLowestOccupiedY()).toBe(expected)
    })
  })

  // --- clear ---

  describe('clear', () => {
    it('removes all hats and resets size to 0', () => {
      grid.fillInitialGrid(3)
      expect(grid.size).toBeGreaterThan(0)
      grid.clear()
      expect(grid.size).toBe(0)
      expect(grid.getAllHats()).toHaveLength(0)
    })
  })

  // --- snapToGrid ---

  describe('snapToGrid', () => {
    it('snaps to (0,0) for empty grid at top-left pixel', () => {
      const result = grid.snapToGrid(HAT_RADIUS, HAT_RADIUS)
      expect(result).toEqual({ row: 0, col: 0 })
    })

    it('returns null when all candidate cells are occupied', () => {
      grid.fillInitialGrid(2)
      const result = grid.snapToGrid(HAT_RADIUS, HAT_RADIUS)
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('avoids already-occupied cells', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.TOP_HAT)
      const { x, y } = grid.toPixel({ row: 0, col: 0 })
      const result = grid.snapToGrid(x, y)
      expect(result).not.toEqual({ row: 0, col: 0 })
    })
  })

  // --- getLowestRow ---

  describe('getLowestRow', () => {
    it('returns -1 for empty grid', () => {
      expect(grid.getLowestRow()).toBe(-1)
    })

    it('returns the highest row index present', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.FEDORA)
      grid.setHat({ row: 3, col: 1 }, HatType.WITCH)
      grid.setHat({ row: 1, col: 0 }, HatType.TOP_HAT)
      expect(grid.getLowestRow()).toBe(3)
    })
  })

  // --- findDisconnected: all floating ---

  describe('findDisconnected (no ceiling hats)', () => {
    it('returns all hats when none are in row 0', () => {
      grid.setHat({ row: 2, col: 2 }, HatType.BERET)
      grid.setHat({ row: 3, col: 2 }, HatType.COWBOY)
      const disconnected = grid.findDisconnected()
      expect(disconnected.has('2,2')).toBe(true)
      expect(disconnected.has('3,2')).toBe(true)
      expect(disconnected.size).toBe(2)
    })
  })

  // --- removeByKeys: non-existent key ---

  describe('removeByKeys (missing keys)', () => {
    it('silently skips keys that do not exist', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.PROPELLER)
      const removed = grid.removeByKeys(new Set(['0,0', '9,9']))
      expect(removed).toHaveLength(1)
      expect(removed[0].pos).toEqual({ row: 0, col: 0 })
    })
  })

  // --- findMatches: multi-row diagonal cluster ---

  describe('findMatches (diagonal / multi-row)', () => {
    it('finds a match spanning two rows via diagonal adjacency', () => {
      grid.setHat({ row: 0, col: 3 }, HatType.WITCH)
      grid.setHat({ row: 1, col: 2 }, HatType.WITCH)
      grid.setHat({ row: 1, col: 3 }, HatType.WITCH)
      const matches = grid.findMatches({ row: 0, col: 3 }, HatType.WITCH)
      expect(matches.size).toBe(3)
    })
  })

  // --- fillInitialGrid: type validation via HAT_TYPE_COUNT ---

  describe('fillInitialGrid type validation', () => {
    it('all hat types are within valid enum range', () => {
      grid.fillInitialGrid(4)
      const hats = grid.getAllHats()
      const validTypes = new Set([0, 1, 2, 3, 4, 5, 6])
      expect(hats.every(h => validTypes.has(h.type))).toBe(true)
    })
  })

  // --- getActiveTypes ---

  describe('getActiveTypes', () => {
    it('returns empty array for empty grid', () => {
      expect(grid.getActiveTypes()).toHaveLength(0)
    })

    it('returns only the types present on the grid', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.TOP_HAT)
      grid.setHat({ row: 0, col: 1 }, HatType.FEDORA)
      grid.setHat({ row: 0, col: 2 }, HatType.TOP_HAT)
      const types = grid.getActiveTypes()
      expect(types).toHaveLength(2)
      expect(types).toContain(HatType.TOP_HAT)
      expect(types).toContain(HatType.FEDORA)
    })

    it('returns all types when all are present', () => {
      for (let i = 0; i < 7; i++) {
        grid.setHat({ row: 0, col: i }, i as HatType)
      }
      expect(grid.getActiveTypes()).toHaveLength(7)
    })

    it('updates when hats are removed', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.WITCH)
      grid.setHat({ row: 0, col: 1 }, HatType.COWBOY)
      grid.removeHat({ row: 0, col: 1 })
      const types = grid.getActiveTypes()
      expect(types).toHaveLength(1)
      expect(types).toContain(HatType.WITCH)
    })
  })

  // --- advanceRows ---

  describe('advanceRows', () => {
    it('shifts existing hats down by one row', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.TOP_HAT)
      grid.setHat({ row: 0, col: 1 }, HatType.FEDORA)
      grid.advanceRows()
      expect(grid.getHat({ row: 1, col: 0 })).toBe(HatType.TOP_HAT)
      expect(grid.getHat({ row: 1, col: 1 })).toBe(HatType.FEDORA)
      expect(grid.getHat({ row: 0, col: 0 })).not.toBeNull()
    })

    it('seeds a full row 0 after advancing', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.WITCH)
      grid.advanceRows()
      let row0Count = 0
      for (let col = 0; col < GRID_COLS; col++) {
        if (grid.getHat({ row: 0, col }) !== null) row0Count++
      }
      expect(row0Count).toBe(GRID_COLS)
    })

    it('does not leave any row-0 hats from the old layout', () => {
      grid.setHat({ row: 0, col: 2 }, HatType.BERET)
      grid.advanceRows()
      expect(grid.getHat({ row: 1, col: 2 })).toBe(HatType.BERET)
    })

    it('increases total hat count by one row', () => {
      grid.fillInitialGrid(3)
      const before = grid.size
      grid.advanceRows()
      expect(grid.size).toBe(before + GRID_COLS)
    })
  })

  // --- findMatchesAll ---

  describe('findMatchesAll', () => {
    it('returns single-cell set when no neighbors match', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.TOP_HAT)
      grid.setHat({ row: 0, col: 1 }, HatType.FEDORA)
      const result = grid.findMatchesAll({ row: 0, col: 0 }, HatType.TOP_HAT)
      expect(result.size).toBe(1)
    })

    it('returns group of 2 (below MIN_MATCH_COUNT) unlike findMatches', () => {
      grid.setHat({ row: 0, col: 0 }, HatType.WITCH)
      grid.setHat({ row: 0, col: 1 }, HatType.WITCH)
      const all = grid.findMatchesAll({ row: 0, col: 0 }, HatType.WITCH)
      const strict = grid.findMatches({ row: 0, col: 0 }, HatType.WITCH)
      expect(all.size).toBe(2)
      expect(strict.size).toBe(0)
    })

    it('returns same result as findMatches when group >= MIN_MATCH_COUNT', () => {
      for (let c = 0; c < 4; c++) grid.setHat({ row: 0, col: c }, HatType.COWBOY)
      const all = grid.findMatchesAll({ row: 0, col: 1 }, HatType.COWBOY)
      const strict = grid.findMatches({ row: 0, col: 1 }, HatType.COWBOY)
      expect(all.size).toBe(4)
      expect(strict.size).toBe(4)
    })
  })
})
