import { MIN_MATCH_COUNT } from '../types'

export const MAX_COMBO = 8

export function scoreMatches(count: number, combo: number): number {
  return count * 100 * combo
}

export function scoreFalls(count: number, combo: number): number {
  return count * 50 * combo
}

export function nextCombo(current: number): number {
  return Math.min(current + 1, MAX_COMBO)
}

export function resetCombo(): number {
  return 1
}

export function calculateShotScore(
  matchedCount: number,
  fallenCount: number,
  combo: number,
): { points: number; newCombo: number } {
  if (matchedCount < MIN_MATCH_COUNT) {
    return { points: 0, newCombo: resetCombo() }
  }
  const points = scoreMatches(matchedCount, combo) + scoreFalls(fallenCount, combo)
  return { points, newCombo: nextCombo(combo) }
}
