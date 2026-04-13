import { useRef, useEffect, useCallback, useMemo } from "react";
import { useSynthesis5Store } from "../../store/useSynthesis5Store";
import type { Synthesis5Result } from "../../lib/synthesis5/types";
import { distance} from "../../lib/geometry/math";
import type { Point, Line } from "../../lib/geometry/math";
import { PAIR_COMBINATIONS } from "../../lib/synthesis5/remap";
import {
  solvePosition,
  solvePositionInverse,
  computeCouplerCurve,
  computeRockerLimits,
  computeRockerLimitsFollower,
  detectBranch,
  rockerTick,
} from "../../lib/synthesis5/kinematics";

import type {
  RockerLimits,
} from "../../lib/synthesis5/kinematics";

interface Props {
  result: Synthesis5Result | null;
}

interface GhostPose {
  A: Point;
  B: Point;
  C: Point;
}

const POINT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316"];
const GRID_SPACING = 50;
const MIN_LABEL_PX = 55;
const EPSILON      = 1e-9;
const MIN_ZOOM     = 0.05;
const MAX_ZOOM     = 20;

function niceStep(zoom: number): number {
  const minWorld  = MIN_LABEL_PX / zoom;
  const rawMult   = minWorld / GRID_SPACING;
  const multiples = [1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 500, 1000];
  for (const m of multiples) if (m >= rawMult) return m * GRID_SPACING;
  return 1000 * GRID_SPACING;
}

/**
 * Rigid-body transform: find Bi such that triangle(Ai, Bi, Ci) is
 * congruent to triangle(A1, B1, C1) with identical handedness.
 * Since |Ai Ci| = |A1 C1| = r by synthesis, scale = 1 exactly.
 */
function rigidTransformBi(
  A1: Point, B1: Point, C1: Point,
  Ai: Point, Ci: Point
): Point {
  // Reference edge A1→C1
  const edgeX = C1.x - A1.x;
  const edgeY = C1.y - A1.y;
  const len   = Math.hypot(edgeX, edgeY);
  if (len < EPSILON) {
    // Degenerate: A1 == C1, just translate B1 by same offset
    return { x: B1.x + (Ai.x - A1.x), y: B1.y + (Ai.y - A1.y) };
  }

  // Unit axes of reference frame (right-hand: ux along A1→C1, uy = ux rotated 90° CCW)
  const ux = { x: edgeX / len, y: edgeY / len };
  const uy = { x: -ux.y,       y:  ux.x       };

  // B1 in reference local frame
  const dB = { x: B1.x - A1.x, y: B1.y - A1.y };
  const bx  = dB.x * ux.x + dB.y * ux.y;
  const by  = dB.x * uy.x + dB.y * uy.y;

  // New edge Ai→Ci
  const edgeX2 = Ci.x - Ai.x;
  const edgeY2 = Ci.y - Ai.y;
  const len2   = Math.hypot(edgeX2, edgeY2);
  if (len2 < EPSILON) {
    return { x: Ai.x + (B1.x - A1.x), y: Ai.y + (B1.y - A1.y) };
  }

  // New frame unit axes
  const ux2 = { x: edgeX2 / len2, y: edgeY2 / len2 };
  const uy2 = { x: -ux2.y,        y:  ux2.x        };

  // Scale factor (= 1 when |AiCi| = |A1C1| = r, which synthesis guarantees)
  const scale = len2 / len;

  return {
    x: Ai.x + (bx * scale) * ux2.x + (by * scale) * uy2.x,
    y: Ai.y + (bx * scale) * ux2.y + (by * scale) * uy2.y,
  };
}

function buildGhostPose(
  Ai: Point, Ci: Point,
  A1_ref: Point, B1: Point, C1_ref: Point
): GhostPose {
  return {
    A: Ai,
    B: rigidTransformBi(A1_ref, B1, C1_ref, Ai, Ci),
    C: Ci,
  };
}

export default function CanvasArea5({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── All mutable animation state lives here — never stale ────────
  const stateRef = useRef({
    crankAngle:      0,
    rockerDirection: 1 as 1 | -1,
    isPlaying:       false,
    speedRPM:        30,
    zoom:            1,
    panX:            0,
    panY:            0,
  });
  const limitsRef = useRef<RockerLimits | null>(null);
  const rafRef    = useRef<number>(0);
  const lastTRef  = useRef<number>(0);

  const isPanningRef = useRef(false);
  const panStartRef  = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });

  // ── Store subscriptions ──────────────────────────────────────────
  const precisionPoints  = useSynthesis5Store((s) => s.precisionPoints);
  const showConstruction = useSynthesis5Store((s) => s.showConstruction);
  const showGhosts       = useSynthesis5Store((s) => s.showGhosts);
  const showCouplerCurve = useSynthesis5Store((s) => s.showCouplerCurve);
  const isPlaying        = useSynthesis5Store((s) => s.isPlaying);
  const speedRPM         = useSynthesis5Store((s) => s.speedRPM);
  const crankAngle       = useSynthesis5Store((s) => s.crankAngle);
  const rockerDirection  = useSynthesis5Store((s) => s.rockerDirection);
  const r                = useSynthesis5Store((s) => s.r);
  const pairChoice       = useSynthesis5Store((s) => s.pairChoice);
  const zoom             = useSynthesis5Store((s) => s.zoom);
  const panX             = useSynthesis5Store((s) => s.panX);
  const panY             = useSynthesis5Store((s) => s.panY);

  const placePoint         = useSynthesis5Store((s) => s.placePoint);
  const setCrankAngle      = useSynthesis5Store((s) => s.setCrankAngle);
  const setRockerDirection = useSynthesis5Store((s) => s.setRockerDirection);
  const setZoom            = useSynthesis5Store((s) => s.setZoom);
  const setPan             = useSynthesis5Store((s) => s.setPan);
  const resetView          = useSynthesis5Store((s) => s.resetView);

  // Sync all animation state into the ref so the RAF loop always reads fresh values
  useEffect(() => { stateRef.current.crankAngle      = crankAngle;     }, [crankAngle]);
  useEffect(() => { stateRef.current.rockerDirection = rockerDirection; }, [rockerDirection]);
  useEffect(() => {
    stateRef.current.isPlaying = isPlaying;
    if (!isPlaying) lastTRef.current = 0;
  }, [isPlaying]);
  useEffect(() => { stateRef.current.speedRPM = speedRPM; }, [speedRPM]);
  useEffect(() => { stateRef.current.zoom = zoom; }, [zoom]);
  useEffect(() => { stateRef.current.panX = panX; }, [panX]);
  useEffect(() => { stateRef.current.panY = panY; }, [panY]);

  const followerIsDriver = result?.status === "success"
    ? (result.followerIsDriver ?? false) : false;

  const combo = PAIR_COMBINATIONS[pairChoice];

  // Kinematic reference point (alpha[0] in original space)
  const C1_ref = useMemo(() => {
    if (precisionPoints.length < 5) return null;
    return precisionPoints[combo.alpha[0]];
  }, [precisionPoints, combo]);

  const A1_ref = useMemo(() => {
    if (!result?.A) return null;
    return result.A[combo.alpha[0]];
  }, [result?.A, combo]);

  const rockerLimits = useMemo((): RockerLimits | null => {
    if (result?.status !== "success" || !result.HC || !result.HR || !result.lengths)
      return null;
    if (result.followerIsDriver)
      return computeRockerLimitsFollower(result.startAngle);
    return computeRockerLimits(
      result.HC, result.HR,
      result.lengths.ground, result.lengths.crank,
      result.lengths.coupler, result.lengths.follower,
      result.canFullRotate ?? false,
      result.startAngle
    );
  }, [result]);

  // Sync start angle when result changes
  useEffect(() => {
    if (result?.status === "success" && result.startAngle !== undefined) {
      const sa = result.startAngle;
      limitsRef.current                  = rockerLimits;
      stateRef.current.crankAngle        = sa;
      stateRef.current.rockerDirection   = 1;
      setCrankAngle(sa);
      setRockerDirection(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.startAngle, rockerLimits]);

  useEffect(() => { limitsRef.current = rockerLimits; }, [rockerLimits]);

  const branch = useMemo((): 1 | -1 => {
    if (
      result?.status !== "success" || !result.HC || !result.HR ||
      !result.B1 || !result.A || !result.lengths ||
      !C1_ref || !A1_ref
    ) return 1;
    return detectBranch(
      result.HC, result.HR,
      result.lengths.crank, result.lengths.coupler, result.lengths.follower,
      A1_ref, result.B1, C1_ref,
      followerIsDriver
    );
  }, [result, C1_ref, A1_ref, followerIsDriver]);

  const couplerCurve = useMemo((): Point[] => {
    if (
      result?.status !== "success" || !result.HC || !result.HR ||
      !result.B1 || !result.A || !result.lengths || !rockerLimits ||
      !C1_ref || !A1_ref
    ) return [];
    return computeCouplerCurve(
      result.HC, result.HR,
      result.lengths.crank, result.lengths.coupler, result.lengths.follower,
      A1_ref, result.B1, C1_ref,
      branch, rockerLimits, followerIsDriver, 720
    );
  }, [result, rockerLimits, branch, followerIsDriver, C1_ref, A1_ref]);

  // Ghost poses — rigid body transform, C vertex = exact precision point
  const ghostPoses = useMemo((): (GhostPose | null)[] => {
    if (
      result?.status !== "success" || !result.B1 || !result.A ||
      !C1_ref || !A1_ref || precisionPoints.length < 5
    ) return [];

    const refIdx       = combo.alpha[0];
    const otherIndices = [0, 1, 2, 3, 4].filter((i) => i !== refIdx);

    return otherIndices.map((origIdx) => {
      const Ci = precisionPoints[origIdx];
      const Ai = result.A![origIdx];
      if (!Ci || !Ai) return null;
      return buildGhostPose(Ai, Ci, A1_ref!, result.B1!, C1_ref!);
    });
  }, [result, precisionPoints, combo, C1_ref, A1_ref]);

  // ── Canvas resize ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    setSize();
    return () => ro.disconnect();
  }, []);

  const canvasToWorld = useCallback(
    (cx: number, cy: number, rect: DOMRect): Point => ({
      x:  (cx - rect.width  / 2 - stateRef.current.panX) / stateRef.current.zoom,
      y: -((cy - rect.height / 2 - stateRef.current.panY) / stateRef.current.zoom),
    }),
    []
  );

  // ── Wheel zoom ───────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { zoom: z, panX: px, panY: py } = stateRef.current;
      const rect    = canvas.getBoundingClientRect();
      const cx      = e.clientX - rect.left;
      const cy      = e.clientY - rect.top;
      const factor  = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      const zr      = newZoom / z;
      setZoom(newZoom);
      setPan(
        cx - rect.width  / 2 - zr * (cx - rect.width  / 2 - px),
        cy - rect.height / 2 - zr * (cy - rect.height / 2 - py)
      );
    },
    [setZoom, setPan]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pan ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
        isPanningRef.current = true;
        panStartRef.current  = { x: e.clientX, y: e.clientY };
        panOriginRef.current = { x: stateRef.current.panX, y: stateRef.current.panY };
        e.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPanningRef.current) return;
      setPan(
        panOriginRef.current.x + e.clientX - panStartRef.current.x,
        panOriginRef.current.y + e.clientY - panStartRef.current.y
      );
    },
    [setPan]
  );

  const handleMouseUp  = useCallback(() => { isPanningRef.current = false; }, []);
  const handleCtxMenu  = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;
      if (e.button !== 0 || e.altKey) return;
      if (precisionPoints.length >= 5) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      placePoint(canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, rect));
    },
    [precisionPoints.length, placePoint, canvasToWorld]
  );

  // ── Single stable RAF loop with draw inline ───────────────────────
  // All rendering data is passed via a ref to avoid stale closures.
  const renderDataRef = useRef({
    result:         null as Synthesis5Result | null,
    precisionPoints: [] as Point[],
    showConstruction: true,
    showGhosts:      true,
    showCouplerCurve: true,
    r:               40,
    combo:           PAIR_COMBINATIONS[0],
    couplerCurve:    [] as Point[],
    ghostPoses:      [] as (GhostPose | null)[],
    branch:          1 as 1 | -1,
    followerIsDriver: false,
    C1_ref:          null as Point | null,
    A1_ref:          null as Point | null,
  });

  // Keep render data ref fresh every render
  renderDataRef.current = {
    result,
    precisionPoints,
    showConstruction,
    showGhosts,
    showCouplerCurve,
    r,
    combo,
    couplerCurve,
    ghostPoses,
    branch,
    followerIsDriver,
    C1_ref,
    A1_ref,
  };

  // ── Single stable RAF loop ────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const {
        result, precisionPoints, showConstruction, showGhosts, showCouplerCurve,
        r, combo, couplerCurve, ghostPoses, branch, followerIsDriver,
        C1_ref, A1_ref,
      } = renderDataRef.current;

      const { zoom, panX, panY } = stateRef.current;

      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.width  / dpr;
      const h   = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + panX, h / 2 + panY);
      ctx.scale(zoom, -zoom);

      const xMin = (-w / 2 - panX) / zoom;
      const xMax = ( w / 2 - panX) / zoom;
      const yMin = (-h / 2 - panY) / zoom;
      const yMax = ( h / 2 - panY) / zoom;

      // Grid
      ctx.strokeStyle = "#f1f5f9"; ctx.lineWidth = 1 / zoom;
      const gx0 = Math.floor(xMin / GRID_SPACING) * GRID_SPACING;
      const gx1 = Math.ceil (xMax / GRID_SPACING) * GRID_SPACING;
      const gy0 = Math.floor(yMin / GRID_SPACING) * GRID_SPACING;
      const gy1 = Math.ceil (yMax / GRID_SPACING) * GRID_SPACING;
      for (let x = gx0; x <= gx1; x += GRID_SPACING) {
        ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); ctx.stroke();
      }
      for (let y = gy0; y <= gy1; y += GRID_SPACING) {
        ctx.beginPath(); ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.moveTo(xMin, 0); ctx.lineTo(xMax, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, yMin); ctx.lineTo(0, yMax); ctx.stroke();

      // Axis labels
      const labelStep = niceStep(zoom);
      ctx.save();
      ctx.scale(1 / zoom, -1 / zoom);
      ctx.fillStyle = "#94a3b8"; ctx.font = "10px monospace"; ctx.textAlign = "left";
      for (let x = Math.ceil(xMin / labelStep) * labelStep; x <= xMax; x += labelStep) {
        if (Math.abs(x) < EPSILON) continue;
        ctx.fillText(String(Math.round(x)), x * zoom + 2, 14);
      }
      for (let y = Math.ceil(yMin / labelStep) * labelStep; y <= yMax; y += labelStep) {
        if (Math.abs(y) < EPSILON) continue;
        ctx.fillText(String(Math.round(y)), 4, -y * zoom + 4);
      }
      ctx.restore();

      const lw = (n: number) => n / zoom;

      const drawDot = (
        p: Point, color: string, label: string,
        screenR = 5, shape: "circle" | "square" | "diamond" = "circle"
      ) => {
        const pr = screenR / zoom;
        ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 / zoom;
        if (shape === "circle") {
          ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        } else if (shape === "square") {
          ctx.fillRect  (p.x - pr, p.y - pr, pr * 2, pr * 2);
          ctx.strokeRect(p.x - pr, p.y - pr, pr * 2, pr * 2);
        } else {
          ctx.beginPath();
          ctx.moveTo(p.x,      p.y + pr); ctx.lineTo(p.x + pr, p.y);
          ctx.lineTo(p.x,      p.y - pr); ctx.lineTo(p.x - pr, p.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        if (label) {
          ctx.save(); ctx.scale(1 / zoom, -1 / zoom);
          ctx.fillStyle = color; ctx.font = "bold 11px sans-serif";
          ctx.fillText(label, (p.x + pr) * zoom + 4, -p.y * zoom - 4);
          ctx.restore();
        }
      };

      const seg = (
        p1: Point, p2: Point, color: string, width: number, dash: number[] = []
      ) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map((d) => d / zoom));
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const circ = (
        c: Point, rad: number, color: string, width: number, dash: number[] = []
      ) => {
        if (rad < EPSILON) return;
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map((d) => d / zoom));
        ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const arcSeg = (
        c: Point, rad: number, a0: number, a1: number,
        color: string, width: number, dash: number[] = []
      ) => {
        if (rad < EPSILON) return;
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map((d) => d / zoom));
        ctx.beginPath(); ctx.arc(c.x, c.y, rad, a0, a1);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const infLine = (ln: Line, color: string, width: number, dash: number[] = []) => {
        const ext = Math.max(w, h) * 3 / zoom;
        seg(
          { x: ln.p.x - ln.dir.x * ext, y: ln.p.y - ln.dir.y * ext },
          { x: ln.p.x + ln.dir.x * ext, y: ln.p.y + ln.dir.y * ext },
          color, width, dash
        );
      };

      const anchor = (p: Point) => {
        const sz   = 8 / zoom;
        const tick = sz / 2;
        ctx.fillStyle = "#374151";
        ctx.beginPath();
        ctx.moveTo(p.x - sz, p.y - sz);
        ctx.lineTo(p.x + sz, p.y - sz);
        ctx.lineTo(p.x, p.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#374151"; ctx.lineWidth = lw(1);
        for (let i = -sz; i <= sz; i += tick) {
          ctx.beginPath();
          ctx.moveTo(p.x + i, p.y - sz);
          ctx.lineTo(p.x + i - tick, p.y - sz - tick);
          ctx.stroke();
        }
      };

      // ── Always draw: precision points ───────────────────────────
      precisionPoints.forEach((p, i) =>
        drawDot(p, POINT_COLORS[i], `C${i + 1}`, 6)
      );

      // ── If no valid result, stop here ───────────────────────────
      // (construction lines may still be partially shown below)
      const res = result;

      // Draw partial construction even on error
      if (res?.bisectorPair1 && showConstruction)
        infLine(res.bisectorPair1, "#f87171", 1, [8, 4]);
      if (res?.bisectorPair2 && showConstruction)
        infLine(res.bisectorPair2, "#fb923c", 1, [8, 4]);
      if (res?.a23 && showConstruction)
        infLine(res.a23, "#a78bfa", 1.5, [6, 3]);
      if (res?.HR)
        drawDot(res.HR, "#dc2626", "H_R", 6, "square");

      // Need success + full result to draw the rest
      if (
        res?.status !== "success" ||
        !res.HC || !res.HR || !res.A || !res.B1 || !res.lengths
      ) {
        ctx.restore();
        return;
      }

      // Need kinematic reference points
      if (!C1_ref || !A1_ref) {
        ctx.restore();
        return;
      }

      const lim = limitsRef.current;
      const fid = followerIsDriver;

      // Dynamic labels
      const betaLabel  = `[${combo.beta[0]+1},${combo.beta[1]+1}]`;
      const refPtLabel = `pt${combo.ref+1}`;

      // Ground link + pivots
      anchor(res.HC);
      anchor(res.HR);
      seg(res.HC, res.HR, "#6b7280", 3);

      // ── Full construction ────────────────────────────────────────
      if (showConstruction) {
        if (res.bisectorA12)
          infLine(res.bisectorA12, "#60a5fa", 1, [6, 4]);
        if (res.crankCircle)
          circ(res.crankCircle.center, res.crankCircle.radius,
            "rgba(37,99,235,.2)", 1, [4, 4]);

        // r-arcs from pair-1 points
        const pA0 = precisionPoints[combo.alpha[0]];
        const pA1 = precisionPoints[combo.alpha[1]];
        if (pA0) circ(pA0, r, "rgba(59,130,246,.15)", 1, [3, 3]);
        if (pA1) circ(pA1, r, "rgba(239,68,68,.15)",  1, [3, 3]);

        if (res.point23)
          drawDot(res.point23, "#6b7280", betaLabel, 4, "diamond");
        if (res.point4)
          drawDot(res.point4, "#6b7280", refPtLabel, 4, "diamond");
        if (res.B1 && res.HR)
          circ(res.B1, distance(res.B1, res.HR),
            "rgba(16,185,129,.15)", 1, [3, 3]);
      }

      drawDot(res.HR, "#dc2626", "H_R", 6, "square");
      drawDot(res.HC, "#2563eb", "H_C", 6, "square");

      // ── Coupler curve ────────────────────────────────────────────
      if (showCouplerCurve) {
        if (fid) {
          circ(res.HR, res.lengths.follower, "rgba(34,197,94,.4)", 2);
        } else if (lim && !lim.canFullRotate && lim.halfSpan > EPSILON) {
          arcSeg(res.HC, res.lengths.crank, lim.lo, lim.hi,
            "rgba(34,197,94,.5)", 2.5);
          arcSeg(res.HC, res.lengths.crank, lim.hi, lim.lo + 2 * Math.PI,
            "rgba(239,68,68,.2)", 1.5, [4, 4]);
          for (const ang of [lim.lo, lim.hi])
            drawDot({
              x: res.HC.x + res.lengths.crank * Math.cos(ang),
              y: res.HC.y + res.lengths.crank * Math.sin(ang),
            }, "#ef4444", "", 3);
        }

        if (couplerCurve.length > 1) {
          ctx.strokeStyle = "rgba(245,158,11,.55)";
          ctx.lineWidth = lw(1.5);
          ctx.beginPath();
          ctx.moveTo(couplerCurve[0].x, couplerCurve[0].y);
          for (let i = 1; i < couplerCurve.length; i++)
            ctx.lineTo(couplerCurve[i].x, couplerCurve[i].y);
          ctx.stroke();
        }
      }

      // ── Ghost poses ──────────────────────────────────────────────
      if (showGhosts) {
        res.A.forEach((Ai, i) =>
          drawDot(Ai, "#f59e0b", `A${i + 1}`, 4)
        );
        drawDot(res.B1, "#10b981", "B₁", 6, "diamond");

        const refIdx       = combo.alpha[0];
        const otherIndices = [0, 1, 2, 3, 4].filter((i) => i !== refIdx);

        // Reference position ghost
        {
          const gc = "rgba(100,116,139,.2)";
          seg(res.HC, A1_ref, gc, 2);
          seg(res.HR, res.B1, gc, 2);
          ctx.fillStyle   = "rgba(245,158,11,.07)";
          ctx.strokeStyle = gc; ctx.lineWidth = lw(1);
          ctx.beginPath();
          ctx.moveTo(A1_ref.x,  A1_ref.y);
          ctx.lineTo(res.B1.x,  res.B1.y);
          ctx.lineTo(C1_ref.x,  C1_ref.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          drawDot(C1_ref, POINT_COLORS[refIdx], "", 5);
        }

        // Other positions
        ghostPoses.forEach((pose, idx) => {
          if (!pose) return;
          const origIdx = otherIndices[idx];
          const gc = "rgba(100,116,139,.2)";
          seg(res.HC!, pose.A, gc, 2);
          seg(res.HR!, pose.B, gc, 2);
          ctx.fillStyle   = "rgba(245,158,11,.07)";
          ctx.strokeStyle = gc; ctx.lineWidth = lw(1);
          ctx.beginPath();
          ctx.moveTo(pose.A.x, pose.A.y);
          ctx.lineTo(pose.B.x, pose.B.y);
          ctx.lineTo(pose.C.x, pose.C.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          drawDot(pose.C, POINT_COLORS[origIdx], "", 5);
        });
      }

      // ── Active pose ──────────────────────────────────────────────
      const theta = stateRef.current.crankAngle;
      const animPose = fid
        ? solvePositionInverse(
            res.HC, res.HR,
            res.lengths.crank, res.lengths.coupler, res.lengths.follower,
            A1_ref, res.B1, C1_ref, theta, branch
          )
        : solvePosition(
            res.HC, res.HR,
            res.lengths.crank, res.lengths.coupler, res.lengths.follower,
            A1_ref, res.B1, C1_ref, theta, branch
          );

      if (animPose) {
        seg(res.HC, animPose.A, "#2563eb", 3);
        seg(res.HR, animPose.B, "#16a34a", 3);
        ctx.fillStyle   = "rgba(245,158,11,.15)";
        ctx.strokeStyle = "#d97706"; ctx.lineWidth = lw(2.5);
        ctx.beginPath();
        ctx.moveTo(animPose.A.x, animPose.A.y);
        ctx.lineTo(animPose.B.x, animPose.B.y);
        ctx.lineTo(animPose.C.x, animPose.C.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        drawDot(animPose.A, "#2563eb", "", 4);
        drawDot(animPose.B, "#16a34a", "", 4);
        drawDot(animPose.C, "#d97706", "C", 4);
      } else {
        if (fid) {
          const deadB = {
            x: res.HR.x + res.lengths.follower * Math.cos(theta),
            y: res.HR.y + res.lengths.follower * Math.sin(theta),
          };
          seg(res.HR, deadB, "rgba(239,68,68,.4)", 2, [4, 4]);
          drawDot(deadB, "#ef4444", "✕", 4);
        } else {
          const deadA = {
            x: res.HC.x + res.lengths.crank * Math.cos(theta),
            y: res.HC.y + res.lengths.crank * Math.sin(theta),
          };
          seg(res.HC, deadA, "rgba(239,68,68,.4)", 2, [4, 4]);
          drawDot(deadA, "#ef4444", "✕", 4);
        }
      }

      ctx.restore();
    }; // end draw()

    const loop = (time: number) => {
      if (!alive) return;

      const dt = lastTRef.current > 0
        ? Math.min((time - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = time;

      const st  = stateRef.current;
      const lim = limitsRef.current;

      if (st.isPlaying && lim) {
        const { angle, direction } = rockerTick(
          st.crankAngle, st.rockerDirection, dt, st.speedRPM, lim
        );
        const dirChanged = direction !== st.rockerDirection;
        st.crankAngle      = angle;
        st.rockerDirection = direction;
        setCrankAngle(angle);
        if (dirChanged) setRockerDirection(direction);
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  // Intentionally empty deps — loop runs forever, reads all data from refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCrankAngle, setRockerDirection]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleCtxMenu}
        className="w-full h-full"
        style={{
          cursor: isPanningRef.current
            ? "grabbing"
            : precisionPoints.length < 5 ? "crosshair" : "default",
        }}
      />
      <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
        <button
          onClick={() => setZoom(Math.min(MAX_ZOOM, stateRef.current.zoom * 1.2))}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow text-lg hover:bg-gray-50 flex items-center justify-center"
          title="Zoom in">+</button>
        <button
          onClick={() => setZoom(Math.max(MIN_ZOOM, stateRef.current.zoom / 1.2))}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow text-lg hover:bg-gray-50 flex items-center justify-center"
          title="Zoom out">−</button>
        <button
          onClick={resetView}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow text-xs hover:bg-gray-50 flex items-center justify-center"
          title="Reset view">⊙</button>
        <div className="text-xs text-center text-gray-500 bg-white/80 rounded px-1">
          {Math.round(zoom * 100)}%
        </div>
      </div>
      <div className="absolute bottom-4 left-16 text-xs text-gray-400 pointer-events-none select-none">
        Scroll to zoom · Alt+drag or middle-drag to pan
      </div>
    </div>
  );
}