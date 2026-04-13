import type { Point } from "../geometry/math";

export interface PairCombination {
  alpha: [number, number]; // indices into original C array for pair 1
  beta:  [number, number]; // indices for pair 2
  ref:   number;           // index of reference point
  label: string;
}

export const PAIR_COMBINATIONS: PairCombination[] = [
  { alpha: [0, 4], beta: [1, 2], ref: 3, label: "C₁C₅ / C₂C₃ · ref C₄" },
  { alpha: [0, 4], beta: [1, 3], ref: 2, label: "C₁C₅ / C₂C₄ · ref C₃" },
  { alpha: [0, 4], beta: [2, 3], ref: 1, label: "C₁C₅ / C₃C₄ · ref C₂" },
  { alpha: [0, 3], beta: [1, 2], ref: 4, label: "C₁C₄ / C₂C₃ · ref C₅" },
  { alpha: [1, 4], beta: [2, 3], ref: 0, label: "C₂C₅ / C₃C₄ · ref C₁" },
];

/**
 * Remap original C₁–C₅ to canonical internal order:
 *   internal[0] = alpha[0]  (C_a1)
 *   internal[1] = beta[0]   (C_b1)
 *   internal[2] = beta[1]   (C_b2)
 *   internal[3] = ref        (C_ref)
 *   internal[4] = alpha[1]  (C_a2)
 */
export function remapPoints(
  points: [Point, Point, Point, Point, Point],
  pairChoice: number
): [Point, Point, Point, Point, Point] {
  const { alpha, beta, ref } = PAIR_COMBINATIONS[pairChoice];
  return [
    points[alpha[0]],
    points[beta[0]],
    points[beta[1]],
    points[ref],
    points[alpha[1]],
  ];
}

/**
 * Remap internal A positions back to original indices.
 * internal[0] → alpha[0], internal[1] → beta[0], etc.
 */
export function unmapAPositions(
  A_internal: [Point, Point, Point, Point, Point],
  pairChoice: number
): [Point, Point, Point, Point, Point] {
  const { alpha, beta, ref } = PAIR_COMBINATIONS[pairChoice];
  const result = new Array(5) as [Point, Point, Point, Point, Point];
  result[alpha[0]] = A_internal[0];
  result[beta[0]]  = A_internal[1];
  result[beta[1]]  = A_internal[2];
  result[ref]      = A_internal[3];
  result[alpha[1]] = A_internal[4];
  return result;
}

/**
 * Remap swap toggles from original indices to internal indices.
 * swapA[i] in original space → swapA_internal[internal_position] in canonical space.
 */
export function remapSwapA(
  swapA: [boolean, boolean, boolean, boolean, boolean],
  pairChoice: number
): [boolean, boolean, boolean, boolean, boolean] {
  const { alpha, beta, ref } = PAIR_COMBINATIONS[pairChoice];
  return [
    swapA[alpha[0]],
    swapA[beta[0]],
    swapA[beta[1]],
    swapA[ref],
    swapA[alpha[1]],
  ];
}