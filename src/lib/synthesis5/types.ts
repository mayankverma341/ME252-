import type { Point, Line, Circle } from "../geometry/math";

export type GrashofType =
  | "Crank-Rocker"
  | "Double-Crank"
  | "Rocker-Crank"
  | "Grashof Double-Rocker"
  | "Change-Point"
  | "Non-Grashof Double-Rocker";

export interface Synthesis5Result {
  status: "success" | "error";
  error?: string;

  HR?: Point;
  HC?: Point;
  A?: [Point, Point, Point, Point, Point];
  B1?: Point;
  point23?: Point;
  point4?: Point;

  bisectorPair1?: Line;
  bisectorPair2?: Line;
  a23?: Line;
  bisectorA12?: Line;
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

  canFullRotate?: boolean;
  followerIsDriver?: boolean;
  startAngle?: number;

  activePairChoice?: number;
  activePair1?: [number, number];
  activePair2?: [number, number];
  activeRef?: number;
}