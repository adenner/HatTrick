import { describe, it, expect } from 'vitest'
import {
  scoreMatches,
  scoreFalls,
  nextCombo,
  resetCombo,
  calculateShotScore,
  MAX_COMBO,
} from '../game/scoring'

describe('scoring', () => {
  describe('scoreMatches', () => {
    it('3 hats at combo 1 = 300', () => {
      expect(scoreMatches(3, 1)).toBe(300)
    })

    it('5 hats at combo 2 = 1000', () => {
      expect(scoreMatches(5, 2)).toBe(1000)
    })

    it('scales linearly with count', () => {
      expect(scoreMatches(6, 1)).toBe(600)
    })
  })

  describe('scoreFalls', () => {
    it('4 fallen at combo 1 = 200', () => {
      expect(scoreFalls(4, 1)).toBe(200)
    })

    it('3 fallen at combo 3 = 450', () => {
      expect(scoreFalls(3, 3)).toBe(450)
    })

    it('0 fallen = 0', () => {
      expect(scoreFalls(0, 5)).toBe(0)
    })
  })

  describe('nextCombo', () => {
    it('increments from 1 to 2', () => {
      expect(nextCombo(1)).toBe(2)
    })

    it('increments from 4 to 5', () => {
      expect(nextCombo(4)).toBe(5)
    })

    it('caps at MAX_COMBO', () => {
      expect(nextCombo(MAX_COMBO)).toBe(MAX_COMBO)
      expect(nextCombo(MAX_COMBO - 1)).toBe(MAX_COMBO)
    })
  })

  describe('resetCombo', () => {
    it('always returns 1', () => {
      expect(resetCombo()).toBe(1)
    })
  })

  describe('calculateShotScore', () => {
    it('< 3 matches: 0 points and reset combo', () => {
      const result = calculateShotScore(2, 0, 3)
      expect(result.points).toBe(0)
      expect(result.newCombo).toBe(1)
    })

    it('exactly 3 matches: 300 points at combo 1', () => {
      const result = calculateShotScore(3, 0, 1)
      expect(result.points).toBe(300)
    })

    it('includes fallen hat bonus', () => {
      const result = calculateShotScore(3, 4, 1)
      expect(result.points).toBe(300 + 200) // 3*100 + 4*50
    })

    it('applies combo multiplier', () => {
      const result = calculateShotScore(3, 0, 2)
      expect(result.points).toBe(600) // 3*100*2
    })

    it('increments combo on success', () => {
      const result = calculateShotScore(3, 0, 1)
      expect(result.newCombo).toBe(2)
    })

    it('resets combo on miss', () => {
      const result = calculateShotScore(1, 0, 5)
      expect(result.newCombo).toBe(1)
    })

    it('combo caps at MAX_COMBO', () => {
      const result = calculateShotScore(5, 0, MAX_COMBO)
      expect(result.newCombo).toBe(MAX_COMBO)
    })

    it('0 matches with fallen = 0 (miss)', () => {
      const result = calculateShotScore(0, 3, 2)
      expect(result.points).toBe(0)
    })
  })
})
