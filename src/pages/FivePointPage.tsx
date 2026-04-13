import { useMemo } from "react";
import { useSynthesis5Store } from "../store/useSynthesis5Store";
import { runSynthesis5 } from "../lib/synthesis5/pipeline";
import type { Synthesis5Result } from "../lib/synthesis5/types";
import ControlPanel5     from "../components/five/ControlPanel5";
import CanvasArea5       from "../components/five/CanvasArea5";
import AnalysisCard5     from "../components/five/AnalysisCard5";
import CoordinatesTable5 from "../components/five/CoordinatesTable5";

export default function FivePointPage() {
  const precisionPoints = useSynthesis5Store((s) => s.precisionPoints);
  const r               = useSynthesis5Store((s) => s.r);
  const alpha           = useSynthesis5Store((s) => s.alpha);
  const pairChoice      = useSynthesis5Store((s) => s.pairChoice);
  const swapA           = useSynthesis5Store((s) => s.swapA);
  const swap23          = useSynthesis5Store((s) => s.swap23);
  const swap4           = useSynthesis5Store((s) => s.swap4);

  const result = useMemo((): Synthesis5Result | null => {
    if (precisionPoints.length !== 5) return null;
    return runSynthesis5(
      precisionPoints as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ],
      alpha, r, pairChoice, swapA, swap23, swap4
    );
  }, [precisionPoints, r, alpha, pairChoice, swapA, swap23, swap4]);

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      <ControlPanel5 result={result} />

      {/* Canvas fills remaining space */}
      <div className="relative flex-1 overflow-hidden">
        <CanvasArea5 result={result} />

        {/* Top-right: coordinates table */}
        <div className="absolute top-4 right-4 z-10">
          <CoordinatesTable5 result={result} />
        </div>

        {/* Bottom-right: analysis card — sits above zoom controls */}
        <div className="absolute bottom-4 right-4 z-10">
          <AnalysisCard5 result={result} />
        </div>

        {/* Error banner — top center */}
        {result?.status === "error" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-4 py-2 rounded shadow-lg z-20 max-w-lg text-center pointer-events-none">
            ❌ {result.error}
          </div>
        )}
      </div>
    </div>
  );
}