import React, { useMemo } from "react";
import { useSynthesisStore } from "../store/useSynthesisStore";
import { runSynthesis } from "../lib/synthesis/pipeline";
import type { SynthesisResult } from "../lib/synthesis/pipeline";
import ControlPanel    from "../components/ControlPanel";
import CanvasArea      from "../components/CanvasArea";
import AnalysisCard    from "../components/AnalysisCard";
import CoordinatesTable from "../components/CoordinatesTable";

export default function FourPointPage() {
  const precisionPoints = useSynthesisStore((s) => s.precisionPoints);
  const R               = useSynthesisStore((s) => s.R);
  const r               = useSynthesisStore((s) => s.r);
  const hrOffset        = useSynthesisStore((s) => s.hrOffset);
  const hcOffset        = useSynthesisStore((s) => s.hcOffset);
  const swapA1A3        = useSynthesisStore((s) => s.swapA1A3);
  const swapA2          = useSynthesisStore((s) => s.swapA2);
  const swapA4          = useSynthesisStore((s) => s.swapA4);

  const result = useMemo((): SynthesisResult | null => {
    if (precisionPoints.length !== 4) return null;
    return runSynthesis(
      precisionPoints as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ],
      R, r, hrOffset, hcOffset, swapA1A3, swapA2, swapA4
    );
  }, [precisionPoints, R, r, hrOffset, hcOffset, swapA1A3, swapA2, swapA4]);

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      <ControlPanel result={result} />
      <div className="relative flex-1">
        <CanvasArea result={result} />
        <CoordinatesTable result={result} />
        <AnalysisCard result={result} />
      </div>
    </div>
  );
}