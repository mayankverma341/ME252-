import {
  distance,
  signedArea,
  perpendicularBisector,
  intersectCircles,
  circumcenter,
  subtract,
  cross2D,
  dot,
  normalize,
  rotate,
  EPSILON,
} from "../geometry/math";

import type { Point, Line, Circle } from "../geometry/math";
import type { Synthesis5Result, GrashofType } from "./types";
import { PAIR_COMBINATIONS, remapPoints, unmapAPositions, remapSwapA } from "./remap";

const MAX_COORD = 1e6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeLineIntersect(l1: Line, l2: Line, epsilon = 1e-10): Point | null {
  const denom = cross2D(l1.dir, l2.dir);
  if (Math.abs(denom) < epsilon) return null;
  const diff = subtract(l2.p, l1.p);
  const t = cross2D(diff, l2.dir) / denom;
  const p: Point = { x: l1.p.x + t * l1.dir.x, y: l1.p.y + t * l1.dir.y };
  if (Math.abs(p.x) > MAX_COORD || Math.abs(p.y) > MAX_COORD) return null;
  return p;
}

function pickByOrientationSign(
  candidates: Point[],
  refSign: number,
  testP: Point,
  testQ: Point,
  swap: boolean
): Point | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const s0 = Math.sign(signedArea(testP, testQ, candidates[0]));
  const matchesRef = s0 === refSign;
  const useFirst = swap ? !matchesRef : matchesRef;
  return useFirst ? candidates[0] : candidates[1];
}

function circleLineIntersect(
  circle: { center: Point; radius: number },
  line: Line
): Point[] {
  const v = subtract(circle.center, line.p);
  const t = dot(v, line.dir);
  const foot: Point = {
    x: line.p.x + t * line.dir.x,
    y: line.p.y + t * line.dir.y,
  };
  const distSq = distance(circle.center, foot) ** 2;
  const rSq = circle.radius ** 2;
  if (distSq > rSq + EPSILON) return [];
  const d = Math.sqrt(Math.max(0, rSq - distSq));
  if (d < EPSILON) return [foot];
  return [
    { x: foot.x + d * line.dir.x, y: foot.y + d * line.dir.y },
    { x: foot.x - d * line.dir.x, y: foot.y - d * line.dir.y },
  ];
}

// ─── Rigid-body coupler transform (A→B frame) ─────────────────────────────────
// Given reference triangle (A1, B1, C1) and new positions (A, B),
// returns the new position of C preserving the rigid body.
// This is identical to rigidTransformPoint in kinematic.ts.
function rigidTransformC(
  A1: Point, B1: Point, C1: Point,
  A:  Point, B:  Point
): Point {
  const refAB  = subtract(B1, A1);
  const refLen = Math.hypot(refAB.x, refAB.y);
  if (refLen < EPSILON) {
    return { x: C1.x + (A.x - A1.x), y: C1.y + (A.y - A1.y) };
  }
  const ex  = { x: refAB.x / refLen, y: refAB.y / refLen };
  const ey  = { x: -ex.y, y: ex.x };
  const dC  = subtract(C1, A1);
  const lx  = dC.x * ex.x + dC.y * ex.y;
  const ly  = dC.x * ey.x + dC.y * ey.y;

  const newAB  = subtract(B, A);
  const newLen = Math.hypot(newAB.x, newAB.y);
  if (newLen < EPSILON) {
    return { x: A.x + lx * ex.x + ly * ey.x, y: A.y + lx * ex.y + ly * ey.y };
  }
  const nex = { x: newAB.x / newLen, y: newAB.y / newLen };
  const ney = { x: -nex.y, y: nex.x };
  return {
    x: A.x + lx * nex.x + ly * ney.x,
    y: A.y + lx * nex.y + ly * ney.y,
  };
}

/**
 * For a candidate crank-pin Ai, compute the best rigid-body residual:
 * find all follower positions Bi (coupler ∩ follower circles), then
 * return min over Bi of |rigidTransformC(A1,B1,C1, Ai,Bi) - Ci|.
 */
function rigidBodyResidual(
  Ai: Point, Ci: Point,
  A1: Point, B1: Point, C1ref: Point,
  couplerLen: number, followerLen: number, HR: Point
): number {
  const bCands = intersectCircles(
    { center: Ai, radius: couplerLen  },
    { center: HR, radius: followerLen }
  );
  if (bCands.length === 0) return Infinity;
  let best = Infinity;
  for (const Bi of bCands) {
    const d = distance(rigidTransformC(A1, B1, C1ref, Ai, Bi), Ci);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Pick the correct Ai from up to 2 candidates using the rigid-body residual.
 * swapFlag lets the user choose the other solution.
 */
function pickAiRigid(
  aCands:      Point[],
  Ci:          Point,
  A1:          Point,
  B1:          Point,
  C1ref:       Point,
  couplerLen:  number,
  followerLen: number,
  HR:          Point,
  swapFlag:    boolean
): Point {
  if (aCands.length <= 1) return aCands[0];
  const r0 = rigidBodyResidual(aCands[0], Ci, A1, B1, C1ref, couplerLen, followerLen, HR);
  const r1 = rigidBodyResidual(aCands[1], Ci, A1, B1, C1ref, couplerLen, followerLen, HR);
  const naturalBest = r0 <= r1 ? 0 : 1;
  return aCands[swapFlag ? 1 - naturalBest : naturalBest];
}

// ─── Grashof ──────────────────────────────────────────────────────────────────

interface LinkSet { ground: number; crank: number; coupler: number; follower: number; }

function classifyGrashof(links: LinkSet): { type: GrashofType; sPlusL: number; pPlusQ: number } {
  const { ground, crank, coupler, follower } = links;
  const named = [
    { name: "ground"   as const, len: ground   },
    { name: "crank"    as const, len: crank    },
    { name: "coupler"  as const, len: coupler  },
    { name: "follower" as const, len: follower },
  ].sort((a, b) => a.len - b.len);

  const s = named[0].len, l = named[3].len, p = named[1].len, q = named[2].len;
  const sPlusL = s + l, pPlusQ = p + q;

  if (Math.abs(sPlusL - pPlusQ) < EPSILON * 100)
    return { type: "Change-Point", sPlusL, pPlusQ };

  if (sPlusL < pPlusQ) {
    switch (named[0].name) {
      case "ground":   return { type: "Double-Crank",          sPlusL, pPlusQ };
      case "crank":    return { type: "Crank-Rocker",          sPlusL, pPlusQ };
      case "follower": return { type: "Rocker-Crank",          sPlusL, pPlusQ };
      case "coupler":  return { type: "Grashof Double-Rocker", sPlusL, pPlusQ };
    }
  }
  return { type: "Non-Grashof Double-Rocker", sPlusL, pPlusQ };
}

function canInputFullyRotate(links: LinkSet): boolean {
  const v = [links.ground, links.crank, links.coupler, links.follower].sort((a, b) => a - b);
  const s = v[0], l = v[3], p = v[1], q = v[2];
  if (s + l >= p + q - EPSILON * 100) return false;
  const tol = EPSILON * 100;
  return Math.abs(links.crank - s) < tol || Math.abs(links.ground - s) < tol;
}

// ─── Canonical pipeline ───────────────────────────────────────────────────────

function runCanonicalPipeline(
  iC: [Point, Point, Point, Point, Point],
  alpha: number,
  r: number,
  swapA: [boolean, boolean, boolean, boolean, boolean],
  swap23: boolean,
  swap4:  boolean
): Synthesis5Result {

  // ── Phase 1: H_R ──────────────────────────────────────────────────
  const c15 = perpendicularBisector(iC[0], iC[4]);
  const c23 = perpendicularBisector(iC[1], iC[2]);

  const HR = safeLineIntersect(c15, c23);
  if (!HR) {
    return {
      status: "error",
      error: "Bisectors c₁₅ and c₂₃ are parallel — choose a different pair combination.",
      bisectorPair1: c15, bisectorPair2: c23,
    };
  }

  // ── Phase 2: a₂₃ ──────────────────────────────────────────────────
  const a23: Line = { p: HR, dir: rotate(normalize(c23.dir), alpha) };

  // ── Phase 3a: A₁, A₂ on a₂₃ ──────────────────────────────────────
  const a2Cands = circleLineIntersect({ center: iC[1], radius: r }, a23);
  if (a2Cands.length === 0)
    return { status: "error", error: "r-arc from C₂ does not intersect a₂₃. Adjust r or α.",
             HR, bisectorPair1: c15, bisectorPair2: c23, a23 };

  const A2 = swapA[1] ? a2Cands[a2Cands.length > 1 ? 1 : 0] : a2Cands[0];

  const a1Cands = circleLineIntersect({ center: iC[0], radius: r }, a23);
  if (a1Cands.length === 0)
    return { status: "error", error: "r-arc from C₁ does not intersect a₂₃. Adjust r or α.",
             HR, bisectorPair1: c15, bisectorPair2: c23, a23 };

  const A1 = swapA[0] ? a1Cands[a1Cands.length > 1 ? 1 : 0] : a1Cands[0];

  // ── Phase 3b: H_C via a₁₂ ⊥-bisector ────────────────────────────
  const bisectorA12 = perpendicularBisector(A1, A2);
  const HC = safeLineIntersect(bisectorA12, a23);
  if (!HC)
    return { status: "error", error: "a₁₂ ∥ a₂₃ — H_C at infinity. Adjust r or α.",
             HR, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12 };

  // ── Phase 3c: Crank circle ────────────────────────────────────────
  const crankRadius = distance(HC, A1);
  if (crankRadius < EPSILON)
    return { status: "error", error: "H_C coincides with A₁. Adjust r or α.",
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23 };

  const crankCircle: Circle = { center: HC, radius: crankRadius };

  if (Math.abs(distance(HC, A2) - crankRadius) > 0.5)
    return { status: "error",
             error: `Crank circle check: |H_CA₂|=${distance(HC,A2).toFixed(2)} ≠ |H_CA₁|=${crankRadius.toFixed(2)}.`,
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  // ── Phase 3d: Candidate sets for A₃, A₄, A₅ ─────────────────────
  const a3Cands = intersectCircles({ center: iC[2], radius: r }, crankCircle);
  if (a3Cands.length === 0)
    return { status: "error", error: "r-arc from C₃ does not reach crank circle. Adjust r or α.",
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  const a4Cands = intersectCircles({ center: iC[3], radius: r }, crankCircle);
  if (a4Cands.length === 0)
    return { status: "error", error: "r-arc from C₄ (ref) does not reach crank circle. Adjust r or α.",
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  const a5Cands = intersectCircles({ center: iC[4], radius: r }, crankCircle);
  if (a5Cands.length === 0)
    return { status: "error", error: "r-arc from C₅ does not reach crank circle. Adjust r or α.",
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  // ── Phase 4: point₂₃ (depends only on A1, A2 — no A4 dependency) ─
  const r_c1_23 = distance(iC[1], HR);
  const r_a1_23 = distance(A2,    HR);
  const p23Cands = intersectCircles(
    { center: iC[0], radius: r_c1_23 },
    { center: A1,    radius: r_a1_23 }
  );
  if (p23Cands.length === 0)
    return { status: "error", error: "Inversion circles for [2,3] do not intersect. Adjust r or α.",
             HR, HC, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  const refSign23 = Math.sign(signedArea(iC[1], A2, HR));
  const point23   = pickByOrientationSign(p23Cands, refSign23, iC[0], A1, swap23);
  if (!point23)
    return { status: "error", error: "Could not orient combined point [2,3].", HR, HC };

  // ── Phase 5: Try both A4 candidates → pick best B1 ───────────────
  // For each A4 candidate, compute point4 → B1, then evaluate total
  // rigid-body residual over ALL five positions. Pick the A4 that gives
  // the smallest total residual (this breaks the circular dependency).

  interface B1Attempt {
    A4:     Point;
    point4: Point;
    B1:     Point;
    totalResidual: number;
  }

  const b1Attempts: B1Attempt[] = [];

  for (const A4_try of a4Cands) {
    // point4 image
    const r_c1_4 = distance(iC[3], HR);
    const r_a1_4 = distance(A4_try, HR);
    const p4C = intersectCircles(
      { center: iC[0], radius: r_c1_4 },
      { center: A1,    radius: r_a1_4 }
    );
    if (p4C.length === 0) continue;

    // const refSign4 = Math.sign(signedArea(iC[3], A4_try, HR));

    // Try both point4 candidates too (swap4 toggle applies to final pick,
    // but here we try both to find best B1 geometry).
    for (const pt4_try of p4C) {
      const col = Math.abs(cross2D(subtract(point23, HR), subtract(pt4_try, HR)));
      if (col < EPSILON * 100) continue;

      const b1_try = circumcenter(HR, point23, pt4_try);
      if (!b1_try) continue;

      const cL = distance(A1, b1_try);
      const fL = distance(HR, b1_try);

      // Evaluate rigid-body residual for ALL 5 positions using this B1
      // (for A3-A5 we try all their candidates and take the best match)
      let totalRes = 0;
      // position 1 & 2: A1, A2 are fixed; check their Ci reproduction
      // (Should be near-zero if synthesis is correct for positions 1&2)
      const bCands1 = intersectCircles({ center: A1, radius: cL }, { center: HR, radius: fL });
      let res1 = Infinity;
      for (const Bi of bCands1) {
        const d = distance(rigidTransformC(A1, b1_try, iC[0], A1, Bi), iC[0]);
        if (d < res1) res1 = d;
      }
      totalRes += res1;

      const bCands2 = intersectCircles({ center: A2, radius: cL }, { center: HR, radius: fL });
      let res2 = Infinity;
      for (const Bi of bCands2) {
        const d = distance(rigidTransformC(A1, b1_try, iC[0], A2, Bi), iC[1]);
        if (d < res2) res2 = d;
      }
      totalRes += res2;

      // positions 3, 4, 5: try all candidates
      for (const [cands, Ci] of [
        [a3Cands, iC[2]] as [Point[], Point],
        [a4Cands, iC[3]] as [Point[], Point],
        [a5Cands, iC[4]] as [Point[], Point],
      ]) {
        let bestRes = Infinity;
        for (const Ai_try of cands) {
          const res = rigidBodyResidual(Ai_try, Ci, A1, b1_try, iC[0], cL, fL, HR);
          if (res < bestRes) bestRes = res;
        }
        totalRes += bestRes;
      }

      b1Attempts.push({ A4: A4_try, point4: pt4_try, B1: b1_try, totalResidual: totalRes });
    }
  }

  if (b1Attempts.length === 0)
    return { status: "error", error: "Could not compute B₁ — point 4 circles do not intersect. Adjust r or α.",
             HR, HC, point23, bisectorPair1: c15, bisectorPair2: c23, a23, bisectorA12, crankCircle };

  // Sort by total residual; respect swap4 by choosing index 0 or 1 of the
  // sorted list (swap4 flips between the best and second-best A4/point4 pair)
  b1Attempts.sort((a, b) => a.totalResidual - b.totalResidual);

  // Among attempts with the same A4 candidate, respect swap4 for point4 choice
  // Partition by A4 candidate
  const byA4_0 = b1Attempts.filter(a => a4Cands.length < 2 || distance(a.A4, a4Cands[0]) < EPSILON * 100);
  const byA4_1 = b1Attempts.filter(a => a4Cands.length >= 2 && distance(a.A4, a4Cands[1]) < EPSILON * 100);

  // Best attempt for each A4 candidate (sorted by residual already)
  const best0 = byA4_0[0];
  const best1 = byA4_1[0];

  // Natural best A4 candidate
  let chosen: B1Attempt;
  if (!best0 && !best1) {
    chosen = b1Attempts[0];
  } else if (!best0) {
    chosen = best1;
  } else if (!best1) {
    chosen = best0;
  } else {
    // swap4 flips between the two A4 candidates' best attempts
    const naturalA4Best = best0.totalResidual <= best1.totalResidual ? best0 : best1;
    const altA4Best     = naturalA4Best === best0 ? best1 : best0;
    chosen = swap4 ? altA4Best : naturalA4Best;
  }

  const { A4: A4_final, point4, B1 } = chosen;

  // ── Phase 6: Correct A₃, A₅ (and verify A₄) with final B1 ────────
  const couplerLen  = distance(A1, B1);
  const followerLen = distance(HR, B1);

  const A3_final = pickAiRigid(a3Cands, iC[2], A1, B1, iC[0], couplerLen, followerLen, HR, swapA[2]);
  const A5_final = pickAiRigid(a5Cands, iC[4], A1, B1, iC[0], couplerLen, followerLen, HR, swapA[4]);

  // A1 and A2 are fixed (on a23); A4 already chosen above.
  const A_internal: [Point, Point, Point, Point, Point] =
    [A1, A2, A3_final, A4_final, A5_final];

  // ── Link lengths & Grashof ─────────────────────────────────────────
  const ground   = distance(HC, HR);
  const crank    = crankRadius;
  const coupler  = couplerLen;
  const follower = followerLen;

  const links         = { ground, crank, coupler, follower };
  const grashofResult = classifyGrashof(links);
  const canFull       = canInputFullyRotate(links);
  const followerIsDrv = grashofResult.type === "Rocker-Crank";

  const startAngle = followerIsDrv
    ? Math.atan2(B1.y - HR.y, B1.x - HR.x)
    : Math.atan2(A1.y - HC.y, A1.x - HC.x);

  return {
    status: "success",
    HR, HC,
    A: A_internal,
    B1, point23, point4,
    bisectorPair1: c15,
    bisectorPair2: c23,
    a23,
    bisectorA12,
    crankCircle,
    lengths: { ground, crank, coupler, follower },
    couplerTriangle: { AB: coupler, AC: r, BC: distance(iC[0], B1) },
    grashof: grashofResult.type,
    grashofValues: { sPlusL: grashofResult.sPlusL, pPlusQ: grashofResult.pPlusQ },
    canFullRotate:    canFull || followerIsDrv,
    followerIsDriver: followerIsDrv,
    startAngle,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function runSynthesis5(
  pts: [Point, Point, Point, Point, Point],
  alpha: number,
  r: number,
  pairChoice: number,
  swapA: [boolean, boolean, boolean, boolean, boolean],
  swap23: boolean,
  swap4: boolean
): Synthesis5Result & {
  activePairChoice: number;
  activePair1: [number, number];
  activePair2: [number, number];
  activeRef: number;
} {
  const combo  = PAIR_COMBINATIONS[pairChoice];
  const iC     = remapPoints(pts, pairChoice);
  const iSwapA = remapSwapA(swapA, pairChoice);

  const raw = runCanonicalPipeline(iC, alpha, r, iSwapA, swap23, swap4);

  let remappedA: [Point, Point, Point, Point, Point] | undefined;
  if (raw.status === "success" && raw.A)
    remappedA = unmapAPositions(raw.A, pairChoice);

  return {
    ...raw,
    A: remappedA ?? raw.A,
    activePairChoice: pairChoice,
    activePair1: combo.alpha,
    activePair2: combo.beta,
    activeRef:   combo.ref,
  };
}