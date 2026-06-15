import { MIN_MATCH_COUNT } from '../types'

/**
 * Maximum combo multiplier that can be accumulated across consecutive
 * successful shots. The multiplier is capped here so that scores do not
 * grow unboundedly after long winning streaks.
 */
export const MAX_COMBO = 8

/**
 * Calculates the points awarded for hats removed by a direct colour match.
 *
 * Each matched hat is worth 100 base points, scaled by the current combo
 * multiplier. A higher combo therefore rewards skilled, unbroken play.
 *
 * @param count - Number of hats eliminated by the match (must be >= {@link MIN_MATCH_COUNT} for the shot to count, but this function does not enforce that guard).
 * @param combo - Current combo multiplier (integer >= 1).
 * @returns Total points for the matched hats: `count * 100 * combo`.
 */
export function scoreMatches(count: number, combo: number): number {
  return count * 100 * combo
}

/**
 * Calculates the bonus points awarded for hats that fall off the grid as a
 * side-effect of a successful match (i.e. hats that were only connected to
 * the ceiling through the matched group).
 *
 * Fallen hats are worth 50 base points each — half the value of directly
 * matched hats — to reward chain reactions without making them the primary
 * scoring mechanism.
 *
 * @param count - Number of hats that fell off the grid after the match.
 * @param combo - Current combo multiplier (integer >= 1).
 * @returns Bonus points for fallen hats: `count * 50 * combo`.
 */
export function scoreFalls(count: number, combo: number): number {
  return count * 50 * combo
}

/**
 * Advances the combo multiplier by one step after a successful shot,
 * capping the result at {@link MAX_COMBO}.
 *
 * @param current - The combo multiplier active before this shot (integer >= 1).
 * @returns The new combo multiplier, in the range [2, {@link MAX_COMBO}].
 */
export function nextCombo(current: number): number {
  return Math.min(current + 1, MAX_COMBO)
}

/**
 * Returns the combo multiplier to its baseline value after a failed shot
 * (i.e. when fewer than {@link MIN_MATCH_COUNT} hats were matched).
 *
 * @returns Always `1`, representing no active combo.
 */
export function resetCombo(): number {
  return 1
}

/**
 * Computes the full score and updated combo for a single shot.
 *
 * If the number of matched hats is below {@link MIN_MATCH_COUNT} the shot
 * is treated as a miss: no points are awarded and the combo resets to 1.
 * Otherwise points from both direct matches and cascade falls are summed and
 * the combo is incremented (up to {@link MAX_COMBO}).
 *
 * @param matchedCount - Number of same-type hats removed by the match.
 * @param fallenCount  - Number of additional hats that fell after the match.
 * @param combo        - Combo multiplier active when the shot was fired (integer >= 1).
 * @returns An object containing:
 *   - `points`   – total points earned this shot (0 on a miss).
 *   - `newCombo` – combo multiplier to use for the next shot (reset to 1 on a miss).
 */
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
