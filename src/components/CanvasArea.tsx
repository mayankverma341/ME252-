import { useRef, useEffect, useCallback, useMemo } from "react";
import { useSynthesisStore } from "../store/useSynthesisStore";
import type { SynthesisResult } from "../lib/synthesis/pipeline";
import { distance } from "../lib/geometry/math";
import type { Point } from "../lib/geometry/math";
import {
  solvePosition,
  solvePositionInverse,
  solveGhostPose,
  computeCouplerCurve,
  computeRockerLimits,
  computeRockerLimitsFollower,
  detectBranch,
  rockerTick,
} from "../lib/synthesis/kinematic";

import type {
  KinematicPose,
  RockerLimits,
} from "../lib/synthesis/kinematic";

interface Props { result: SynthesisResult | null; }

const POINT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7"];
const GRID_SPACING  = 50;
const MIN_LABEL_PX  = 55;
const EPSILON       = 1e-9;
const MIN_ZOOM      = 0.05;
const MAX_ZOOM      = 20;

function niceStep(zoom: number): number {
  const minWorld  = MIN_LABEL_PX / zoom;
  const rawMult   = minWorld / GRID_SPACING;
  const multiples = [1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 500, 1000];
  for (const m of multiples) if (m >= rawMult) return m * GRID_SPACING;
  return 1000 * GRID_SPACING;
}

export default function CanvasArea({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const animRef = useRef({
    crankAngle:      0,
    rockerDirection: 1 as 1 | -1,
    isPlaying:       false,
    speedRPM:        30,
  });
  const limitsRef  = useRef<RockerLimits | null>(null);
  const drawFnRef  = useRef<() => void>(() => {});
  const rafRef     = useRef<number>(0);
  const lastTRef   = useRef<number>(0);

  const isPanningRef  = useRef(false);
  const panStartRef   = useRef({ x: 0, y: 0 });
  const panOriginRef  = useRef({ x: 0, y: 0 });

  // ── Store subscriptions ────────────────────────────────────────────
  const precisionPoints  = useSynthesisStore((s) => s.precisionPoints);
  const showConstruction = useSynthesisStore((s) => s.showConstruction);
  const showGhosts       = useSynthesisStore((s) => s.showGhosts);
  const isPlaying        = useSynthesisStore((s) => s.isPlaying);
  const speedRPM         = useSynthesisStore((s) => s.speedRPM);
  const crankAngle       = useSynthesisStore((s) => s.crankAngle);
  const rockerDirection  = useSynthesisStore((s) => s.rockerDirection);
  const r                = useSynthesisStore((s) => s.r);
  const zoom             = useSynthesisStore((s) => s.zoom);
  const panX             = useSynthesisStore((s) => s.panX);
  const panY             = useSynthesisStore((s) => s.panY);
    // add to store subscriptions
  const showCouplerCurve = useSynthesisStore((s) => s.showCouplerCurve);

  const placePoint         = useSynthesisStore((s) => s.placePoint);
  const setCrankAngle      = useSynthesisStore((s) => s.setCrankAngle);
  const setRockerDirection = useSynthesisStore((s) => s.setRockerDirection);
  const setZoom            = useSynthesisStore((s) => s.setZoom);
  const setPan             = useSynthesisStore((s) => s.setPan);
  const resetView          = useSynthesisStore((s) => s.resetView);

  // Sync anim refs
  useEffect(() => { animRef.current.crankAngle     = crankAngle;     }, [crankAngle]);
  useEffect(() => { animRef.current.rockerDirection = rockerDirection; }, [rockerDirection]);
  useEffect(() => {
    animRef.current.isPlaying = isPlaying;
    if (!isPlaying) lastTRef.current = 0;
  }, [isPlaying]);
  useEffect(() => { animRef.current.speedRPM = speedRPM; }, [speedRPM]);

  // ── Convenience flag ───────────────────────────────────────────────
  const followerIsDriver = result?.status === "success"
    ? (result.followerIsDriver ?? false)
    : false;

  // ── Derived kinematics ─────────────────────────────────────────────
  const rockerLimits = useMemo((): RockerLimits | null => {
    if (result?.status !== "success" || !result.HC || !result.HR || !result.lengths)
      return null;

    if (result.followerIsDriver) {
      // Follower fully rotates — trivially a full circle driven from HR
      return computeRockerLimitsFollower(result.startAngle);
    }

    return computeRockerLimits(
      result.HC, result.HR,
      result.lengths.ground, result.lengths.crank,
      result.lengths.coupler, result.lengths.follower,
      result.canFullRotate ?? false,
      result.startAngle
    );
  }, [result]);

  // Atomic update when result changes: sync limits + angle together
  useEffect(() => {
    if (result?.status === "success" && result.startAngle !== undefined) {
      const sa  = result.startAngle;
      const lim = rockerLimits;

      limitsRef.current               = lim;
      animRef.current.crankAngle      = sa;
      animRef.current.rockerDirection = 1;

      setCrankAngle(sa);
      setRockerDirection(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.startAngle, rockerLimits]);

  useEffect(() => { limitsRef.current = rockerLimits; }, [rockerLimits]);

  const branch = useMemo((): 1 | -1 => {
    if (
      result?.status !== "success" || !result.HC || !result.HR ||
      !result.B1 || !result.A || !result.lengths
    ) return 1;
    const C1 = precisionPoints[0];
    if (!C1) return 1;
    return detectBranch(
      result.HC, result.HR,
      result.lengths.crank, result.lengths.coupler, result.lengths.follower,
      result.A[0], result.B1, C1,
      followerIsDriver
    );
  }, [result, precisionPoints, followerIsDriver]);

  const couplerCurve = useMemo((): Point[] => {
    if (
      result?.status !== "success" || !result.HC || !result.HR ||
      !result.B1 || !result.A || !result.lengths || !rockerLimits
    ) return [];
    const C1 = precisionPoints[0];
    if (!C1) return [];
    return computeCouplerCurve(
      result.HC, result.HR,
      result.lengths.crank, result.lengths.coupler, result.lengths.follower,
      result.A[0], result.B1, C1,
      branch, rockerLimits,
      followerIsDriver,
      720
    );
  }, [result, precisionPoints, rockerLimits, branch, followerIsDriver]);

  const ghostPoses = useMemo((): (KinematicPose | null)[] => {
    if (
      result?.status !== "success" || !result.HC || !result.HR ||
      !result.B1 || !result.A || !result.lengths
    ) return [];
    const pts = precisionPoints;
    if (pts.length < 4) return [];
    const C1 = pts[0];
    return [1, 2, 3].map((i) =>
      solveGhostPose(
        result.HC!, result.HR!,
        result.lengths!.crank, result.lengths!.coupler, result.lengths!.follower,
        result.A![0], result.B1!, C1,
        result.A![i], pts[i],
        followerIsDriver
      )
    );
  }, [result, precisionPoints, followerIsDriver]);

  // ── Canvas resize ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    setSize();
    return () => ro.disconnect();
  }, []);

  // ── Coordinate helper ──────────────────────────────────────────────
  const canvasToWorld = useCallback(
    (cx: number, cy: number, rect: DOMRect): Point => ({
      x:  (cx - rect.width  / 2 - panX) / zoom,
      y: -((cy - rect.height / 2 - panY) / zoom),
    }),
    [zoom, panX, panY]
  );

  // ── Wheel zoom ─────────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect    = canvas.getBoundingClientRect();
      const cx      = e.clientX - rect.left;
      const cy      = e.clientY - rect.top;
      const factor  = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      const zr      = newZoom / zoom;
      setZoom(newZoom);
      setPan(
        cx - rect.width  / 2 - zr * (cx - rect.width  / 2 - panX),
        cy - rect.height / 2 - zr * (cy - rect.height / 2 - panY)
      );
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pan ────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      isPanningRef.current  = true;
      panStartRef.current   = { x: e.clientX, y: e.clientY };
      panOriginRef.current  = { x: panX, y: panY };
      e.preventDefault();
    }
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanningRef.current) return;
    setPan(
      panOriginRef.current.x + e.clientX - panStartRef.current.x,
      panOriginRef.current.y + e.clientY - panStartRef.current.y
    );
  }, [setPan]);

  const handleMouseUp  = useCallback(() => { isPanningRef.current = false; }, []);
  const handleCtxMenu  = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;
      if (e.button !== 0 || e.altKey) return;
      if (precisionPoints.length >= 4) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      placePoint(canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, rect));
    },
    [precisionPoints.length, placePoint, canvasToWorld]
  );

  // ── Build draw function ────────────────────────────────────────────
  useEffect(() => {
    drawFnRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

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

      // ── Grid ──────────────────────────────────────────────────────
      const gStep = GRID_SPACING;
      ctx.strokeStyle = "#f1f5f9"; ctx.lineWidth = 1 / zoom;
      const gx0 = Math.floor(xMin / gStep) * gStep;
      const gx1 = Math.ceil (xMax / gStep) * gStep;
      const gy0 = Math.floor(yMin / gStep) * gStep;
      const gy1 = Math.ceil (yMax / gStep) * gStep;
      for (let x = gx0; x <= gx1; x += gStep) {
        ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); ctx.stroke();
      }
      for (let y = gy0; y <= gy1; y += gStep) {
        ctx.beginPath(); ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); ctx.stroke();
      }

      // ── Axes ──────────────────────────────────────────────────────
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.moveTo(xMin, 0); ctx.lineTo(xMax, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, yMin); ctx.lineTo(0, yMax); ctx.stroke();

      // ── Labels ─────────────────────────────────────────────────────
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

      // ── Drawing helpers ───────────────────────────────────────────
      const lw = (n: number) => n / zoom;

      const dot = (
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
        p1: Point, p2: Point, color: string,
        width: number, dash: number[] = []
      ) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map(d => d / zoom));
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const circ = (
        c: Point, rad: number, color: string,
        width: number, dash: number[] = []
      ) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map(d => d / zoom));
        ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const arcSeg = (
        c: Point, rad: number, a0: number, a1: number,
        color: string, width: number, dash: number[] = []
      ) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw(width);
        ctx.setLineDash(dash.map(d => d / zoom));
        ctx.beginPath(); ctx.arc(c.x, c.y, rad, a0, a1);
        ctx.stroke(); ctx.setLineDash([]);
      };

      const infSeg = (
        ln: { p: Point; dir: Point },
        color: string, width: number, dash: number[] = []
      ) => {
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
        ctx.lineTo(p.x,      p.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#374151"; ctx.lineWidth = lw(1);
        for (let i = -sz; i <= sz; i += tick) {
          ctx.beginPath();
          ctx.moveTo(p.x + i,        p.y - sz);
          ctx.lineTo(p.x + i - tick, p.y - sz - tick);
          ctx.stroke();
        }
      };

      // ════════════════════════════════════════════════════
      // L1: Precision points
      // ════════════════════════════════════════════════════
      precisionPoints.forEach((p, i) => dot(p, POINT_COLORS[i], `C${i + 1}`, 6));

      if (!result?.HR || !result.HC) { ctx.restore(); return; }

      dot(result.HR, "#dc2626", "H_R", 6, "square");
      dot(result.HC, "#2563eb", "H_C", 6, "square");

      if (!result.A || !result.B1 || !result.lengths) { ctx.restore(); return; }
      const [A1, A2, A3, A4] = result.A;
      const B1  = result.B1;
      const C1  = precisionPoints[0];
      if (!C1) { ctx.restore(); return; }

      const lim = limitsRef.current;
      const fid = result.followerIsDriver ?? false;

      anchor(result.HC);
      anchor(result.HR);
      seg(result.HC, result.HR, "#6b7280", 3);

           // ════════════════════════════════════════════════════
      // L2: Construction geometry
      // ════════════════════════════════════════════════════
      if (showConstruction) {
        if (result.bisectorC13)
          infSeg(result.bisectorC13, "#f87171", 1, [6, 4]);
        if (result.rCircle)
          circ(result.rCircle.center, result.rCircle.radius,
            "rgba(239,68,68,.25)", 1, [4, 4]);
        if (precisionPoints.length >= 4 && result.rCircle) {
          circ(precisionPoints[0], r, "rgba(59,130,246,.2)", 1, [3, 3]);
          circ(precisionPoints[2], r, "rgba(34,197,94,.2)",  1, [3, 3]);
        }
        if (result.bisectorA13)
          infSeg(result.bisectorA13, "#60a5fa", 1, [6, 4]);
        if (result.crankCircle)
          circ(result.crankCircle.center, result.crankCircle.radius,
            "rgba(37,99,235,.25)", 1, [4, 4]);
        if (result.P2) dot(result.P2, "#6b7280", "P₂", 3, "diamond");
        if (result.P4) dot(result.P4, "#6b7280", "P₄", 3, "diamond");
        if (result.P2 && result.P4)
          circ(B1, distance(B1, result.HR), "rgba(16,185,129,.2)", 1, [3, 3]);
        // ── P₂/P₄ construction circles (shows how they were found) ──
        if (result.P2) {
          circ(C1,       distance(C1, result.HR),       "rgba(107,114,128,.15)", 1, [2, 4]);
          circ(result.A[0], distance(result.A[0], result.HR), "rgba(107,114,128,.15)", 1, [2, 4]);
        }
      }

      // ════════════════════════════════════════════════════
      // L3: Coupler curve + valid arc
      // ════════════════════════════════════════════════════
      if (showCouplerCurve) {
        // Valid arc / dead-zone on the driving circle
        if (fid) {
          // Rocker-Crank: follower drives — full circle is always valid
          circ(result.HR, result.lengths.follower,
            "rgba(34,197,94,.4)", 2);
        } else if (lim && !lim.canFullRotate && lim.halfSpan > EPSILON) {
          arcSeg(result.HC, result.lengths.crank, lim.lo, lim.hi,
            "rgba(34,197,94,.5)", 2.5);
          arcSeg(result.HC, result.lengths.crank, lim.hi, lim.lo + 2 * Math.PI,
            "rgba(239,68,68,.2)", 1.5, [4, 4]);
          for (const ang of [lim.lo, lim.hi])
            dot(
              {
                x: result.HC.x + result.lengths.crank * Math.cos(ang),
                y: result.HC.y + result.lengths.crank * Math.sin(ang),
              },
              "#ef4444", "", 3
            );
        }

        // Coupler curve trace
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

      // ════════════════════════════════════════════════════
      // L4: Ghost poses
      // ════════════════════════════════════════════════════
      if (showGhosts) {
        dot(A1, "#f59e0b", "A₁", 4);
        dot(A2, "#f59e0b", "A₂", 4);
        dot(A3, "#f59e0b", "A₃", 4);
        dot(A4, "#f59e0b", "A₄", 4);
        dot(B1, "#10b981", "B₁", 6, "diamond");

        ghostPoses.forEach((pose, idx) => {
          if (!pose) return;
          const gc = "rgba(100,116,139,.25)";
          seg(result.HC!, pose.A, gc, 2);
          seg(result.HR!, pose.B, gc, 2);
          ctx.fillStyle = "rgba(245,158,11,.07)";
          ctx.strokeStyle = gc; ctx.lineWidth = lw(1);
          ctx.beginPath();
          ctx.moveTo(pose.A.x, pose.A.y);
          ctx.lineTo(pose.B.x, pose.B.y);
          ctx.lineTo(pose.C.x, pose.C.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          dot(pose.C, POINT_COLORS[idx + 1], "", 3);
        });
      }

      // ════════════════════════════════════════════════════
      // L4: Active pose
      // ════════════════════════════════════════════════════
      const theta    = animRef.current.crankAngle;
      const animPose = fid
        ? solvePositionInverse(
            result.HC, result.HR,
            result.lengths.crank, result.lengths.coupler, result.lengths.follower,
            A1, B1, C1, theta, branch
          )
        : solvePosition(
            result.HC, result.HR,
            result.lengths.crank, result.lengths.coupler, result.lengths.follower,
            A1, B1, C1, theta, branch
          );

      if (animPose) {
        // Crank link (HC → A) — blue
        seg(result.HC, animPose.A, "#2563eb", 3);
        // Follower link (HR → B) — green
        seg(result.HR, animPose.B, "#16a34a", 3);
        // Coupler triangle (A → B → C)
        ctx.fillStyle = "rgba(245,158,11,.15)";
        ctx.strokeStyle = "#d97706"; ctx.lineWidth = lw(2.5);
        ctx.beginPath();
        ctx.moveTo(animPose.A.x, animPose.A.y);
        ctx.lineTo(animPose.B.x, animPose.B.y);
        ctx.lineTo(animPose.C.x, animPose.C.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        dot(animPose.A, "#2563eb", "", 4);
        dot(animPose.B, "#16a34a", "", 4);
        dot(animPose.C, "#d97706", "C", 4);
      } else {
        // Dead-zone indicator — show whichever link is being driven
        if (fid) {
          const deadB = {
            x: result.HR.x + result.lengths.follower * Math.cos(theta),
            y: result.HR.y + result.lengths.follower * Math.sin(theta),
          };
          seg(result.HR, deadB, "rgba(239,68,68,.4)", 2, [4, 4]);
          dot(deadB, "#ef4444", "✕", 4);
        } else {
          const deadA = {
            x: result.HC.x + result.lengths.crank * Math.cos(theta),
            y: result.HC.y + result.lengths.crank * Math.sin(theta),
          };
          seg(result.HC, deadA, "rgba(239,68,68,.4)", 2, [4, 4]);
          dot(deadA, "#ef4444", "✕", 4);
        }
      }

      ctx.restore();
    };
  }, [
    result, precisionPoints, showConstruction, showGhosts, showCouplerCurve, r,
    couplerCurve, ghostPoses, branch, followerIsDriver, zoom, panX, panY,
  ]);

  // ── Single stable rAF loop ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const loop = (time: number) => {
      if (!alive) return;
      const dt = lastTRef.current > 0
        ? Math.min((time - lastTRef.current) / 1000, 0.05)
        : 0;
      lastTRef.current = time;

      const st  = animRef.current;
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

      drawFnRef.current();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
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
            : precisionPoints.length < 4 ? "crosshair" : "default",
        }}
      />
      <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
        <button
          onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.2))}
          className="w-8 h-8 bg-white border border-gray-300 rounded shadow text-lg hover:bg-gray-50 flex items-center justify-center"
          title="Zoom in">+</button>
        <button
          onClick={() => setZoom(Math.max(MIN_ZOOM, zoom / 1.2))}
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