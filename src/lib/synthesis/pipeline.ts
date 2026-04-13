import {
  distance,
  signedArea,
  perpendicularBisector,
  pointOnLine,
  intersectCircles,
  circumcenter,
  areCoincident,
  distancePointToLine,
  EPSILON,
} from "../geometry/math";

import type{
  Point,
  Line,
  Circle,
} from "../geometry/math";

export type GrashofType =
  | "Crank-Rocker"
  | "Double-Crank"
  | "Rocker-Crank"
  | "Grashof Double-Rocker"
  | "Change-Point"
  | "Non-Grashof Double-Rocker";

export interface SynthesisResult {
  status: "success" | "error";
  error?: string;

  HR?: Point;
  HC?: Point;
  A?: [Point, Point, Point, Point];
  B1?: Point;
  P2?: Point;
  P4?: Point;

  bisectorC13?: Line;
  bisectorA13?: Line;
  rCircle?: Circle;
  crankCircle?: Circle;

  lengths?: {
    ground: number;
    crank: number;
    coupler: number;
    follower: number;
  };

  couplerTriangle?: {
    AB: number;
    AC: number;
    BC: number;
  };

  grashof?: GrashofType;
  grashofValues?: { sPlusL: number; pPlusQ: number };

  /** True if the input (crank) link can make a full 360° rotation */
  canFullRotate?: boolean;

  /**
   * True when the follower (HR side) is the shortest link and is therefore
   * the fully-rotating link (Rocker-Crank).  The animator drives phi at HR
   * instead of theta at HC.
   */
  followerIsDriver?: boolean;

  /** Starting angle for animation */
  startAngle?: number;
}

interface LinkSet {
  ground: number;
  crank: number;
  coupler: number;
  follower: number;
}

function classifyGrashof(links: LinkSet): {
  type: GrashofType;
  sPlusL: number;
  pPlusQ: number;
} {
  const { ground, crank, coupler, follower } = links;

  const named = [
    { name: "ground"   as const, len: ground   },
    { name: "crank"    as const, len: crank    },
    { name: "coupler"  as const, len: coupler  },
    { name: "follower" as const, len: follower },
  ].sort((a, b) => a.len - b.len);

  const s = named[0].len;
  const l = named[3].len;
  const p = named[1].len;
  const q = named[2].len;

  const sPlusL = s + l;
  const pPlusQ = p + q;

  if (Math.abs(sPlusL - pPlusQ) < EPSILON * 100) {
    return { type: "Change-Point", sPlusL, pPlusQ };
  }

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

/**
 * Returns true when the link driven from HC (the "crank" in our naming)
 * can make a full 360° rotation.
 *
 * Grashof types where HC-driven link fully rotates:
 *   • Crank-Rocker  – crank is shortest  → HC-link fully rotates ✓
 *   • Double-Crank  – ground is shortest → both links fully rotate ✓
 *
 * Rocker-Crank: follower is shortest → HR-link fully rotates, HC-link rocks.
 *   canInputFullyRotate returns false; followerIsDriver flag handles animation.
 */
function canInputFullyRotate(links: LinkSet): boolean {
  const { ground, crank, coupler, follower } = links;

  const sorted = [ground, crank, coupler, follower].sort((a, b) => a - b);
  const s = sorted[0];
  const l = sorted[3];
  const p = sorted[1];
  const q = sorted[2];

  if (s + l >= p + q - EPSILON * 100) return false;

  const tol = EPSILON * 100;
  return Math.abs(crank - s) < tol || Math.abs(ground - s) < tol;
}

function pickByOrientation(
  candidates: Point[],
  refP: Point,
  refQ: Point,
  refS: Point,
  testP: Point,
  testQ: Point,
  swap: boolean
): Point | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const targetSign = Math.sign(signedArea(refP, refQ, refS));
  const idx0Sign   = Math.sign(signedArea(testP, testQ, candidates[0]));

  const pick = (!swap)
    ? (idx0Sign === targetSign ? 0 : 1)
    : (idx0Sign === targetSign ? 1 : 0);

  return candidates[pick];
}

export const runSynthesis = (
  pts: [Point, Point, Point, Point],
  R: number,
  r: number,
  hrOffset: number,
  hcOffset: number,
  swapA1A3: boolean,
  swapA2: boolean,
  swapA4: boolean
): SynthesisResult => {
  const [C1, C2, C3, C4] = pts;

  // ── Step 1: HR on perpendicular bisector of C1-C3 ────────────────
  const bisectorC13 = perpendicularBisector(C1, C3);
  const HR = pointOnLine(bisectorC13, hrOffset);
  const rCircle: Circle = { center: HR, radius: R };

  // ── Step 2: A1, A3 on r-circle intersected with R-circle ─────────
  const a1Cands = intersectCircles({ center: C1, radius: r }, rCircle);
  if (a1Cands.length === 0) {
    return {
      status: "error",
      error: "r-arc from C₁ does not reach R-circle. Increase r or adjust R/H_R.",
      HR, bisectorC13, rCircle,
    };
  }

  const a3Cands = intersectCircles({ center: C3, radius: r }, rCircle);
  if (a3Cands.length === 0) {
    return {
      status: "error",
      error: "r-arc from C₃ does not reach R-circle. Increase r or adjust R/H_R.",
      HR, bisectorC13, rCircle,
    };
  }

  const A1 = a1Cands.length === 1 ? a1Cands[0] : a1Cands[swapA1A3 ? 1 : 0];

  const targetSignA = Math.sign(signedArea(C1, A1, HR));
  let A3: Point;
  if (a3Cands.length === 1) {
    A3 = a3Cands[0];
  } else {
    const s0 = Math.sign(signedArea(C3, a3Cands[0], HR));
    A3 = s0 === targetSignA ? a3Cands[0] : a3Cands[1];
  }

  // ── Step 3: HC on perpendicular bisector of A1-A3 ─────────────────
  const bisectorA13 = perpendicularBisector(A1, A3);

  const distHRtoA13 = distancePointToLine(HR, bisectorA13);
  if (distHRtoA13 > 0.5) {
    return {
      status: "error",
      error: `Sanity check failed: a₁₃ does not pass through H_R (dist=${distHRtoA13.toFixed(2)}).`,
      HR, bisectorC13, bisectorA13, rCircle,
    };
  }

  const HC = pointOnLine(bisectorA13, hcOffset);
  if (areCoincident(HC, HR)) {
    return {
      status: "error",
      error: "H_C coincides with H_R. Adjust H_C offset.",
      HR, HC, bisectorC13, bisectorA13, rCircle,
    };
  }

  const crankRadius = distance(HC, A1);
  const crankCircle: Circle = { center: HC, radius: crankRadius };

  // ── Step 4: A2, A4 on crank circle ──────────────────────────────
  const a2Cands = intersectCircles({ center: C2, radius: r }, crankCircle);
  if (a2Cands.length === 0) {
    return {
      status: "error",
      error: "r-arc from C₂ does not reach crank circle. Adjust parameters.",
      HR, HC, A: [A1, A1, A3, A1], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }
  const A2 = a2Cands.length === 1 ? a2Cands[0] : a2Cands[swapA2 ? 1 : 0];

  const a4Cands = intersectCircles({ center: C4, radius: r }, crankCircle);
  if (a4Cands.length === 0) {
    return {
      status: "error",
      error: "r-arc from C₄ does not reach crank circle. Adjust parameters.",
      HR, HC, A: [A1, A2, A3, A1], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }
  const A4 = a4Cands.length === 1 ? a4Cands[0] : a4Cands[swapA4 ? 1 : 0];

  // ── Step 5: P2, P4 by inversion ──────────────────────────────────
  const p2Cands = intersectCircles(
    { center: C1, radius: distance(C2, HR) },
    { center: A1, radius: distance(A2, HR) }
  );
  if (p2Cands.length === 0) {
    return {
      status: "error",
      error: "Inversion circles for P₂ do not intersect.",
      HR, HC, A: [A1, A2, A3, A4], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }
  const P2 = pickByOrientation(p2Cands, C2, A2, HR, C1, A1, false);
  if (!P2) {
    return {
      status: "error",
      error: "Could not determine P₂ orientation.",
      HR, HC, A: [A1, A2, A3, A4], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }

  const p4Cands = intersectCircles(
    { center: C1, radius: distance(C4, HR) },
    { center: A1, radius: distance(A4, HR) }
  );
  if (p4Cands.length === 0) {
    return {
      status: "error",
      error: "Inversion circles for P₄ do not intersect.",
      HR, HC, A: [A1, A2, A3, A4], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }
  const P4 = pickByOrientation(p4Cands, C4, A4, HR, C1, A1, false);
  if (!P4) {
    return {
      status: "error",
      error: "Could not determine P₄ orientation.",
      HR, HC, A: [A1, A2, A3, A4], bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }

  // ── Step 6: B1 as circumcenter of HR, P2, P4 ─────────────────────
  const B1 = circumcenter(HR, P2, P4);
  if (!B1) {
    return {
      status: "error",
      error: "H_R, P₂, P₄ are collinear — B₁ at infinity.",
      HR, HC, A: [A1, A2, A3, A4], P2, P4,
      bisectorC13, bisectorA13, rCircle, crankCircle,
    };
  }

  // ── Step 7: Link lengths & classification ─────────────────────────
  const ground   = distance(HC, HR);
  const crank    = crankRadius;
  const coupler  = distance(A1, B1);
  const follower = distance(HR, B1);

  const links: LinkSet = { ground, crank, coupler, follower };
  const grashofResult  = classifyGrashof(links);
  const canFull        = canInputFullyRotate(links);

  // Rocker-Crank: follower is shortest → it fully rotates when driven from HR.
  const followerIsDriver = grashofResult.type === "Rocker-Crank";

  // startAngle: angle of the DRIVING link's moving pivot from its fixed pivot.
  //   • Normal case      → A1 relative to HC (theta)
  //   • Rocker-Crank     → B1 relative to HR (phi)
  const startAngle = followerIsDriver
    ? Math.atan2(B1.y - HR.y, B1.x - HR.x)
    : Math.atan2(A1.y - HC.y, A1.x - HC.x);

  return {
    status: "success",
    HR, HC,
    A: [A1, A2, A3, A4],
    B1, P2, P4,
    bisectorC13, bisectorA13,
    rCircle, crankCircle,
    lengths: { ground, crank, coupler, follower },
    couplerTriangle: {
      AB: coupler,
      AC: r,
      BC: distance(C1, B1),
    },
    grashof: grashofResult.type,
    grashofValues: {
      sPlusL: grashofResult.sPlusL,
      pPlusQ: grashofResult.pPlusQ,
    },
    canFullRotate:    canFull || followerIsDriver,
    followerIsDriver,
    startAngle,
  };
};