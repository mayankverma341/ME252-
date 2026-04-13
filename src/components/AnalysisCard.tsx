import React from "react";
import type { SynthesisResult } from "../lib/synthesis/pipeline";

interface Props {
  result: SynthesisResult | null;
}

export default function AnalysisCard({ result }: Props) {
  if (!result) return null;

  const grashofColors: Record<string, string> = {
    "Crank-Rocker":             "text-green-700 bg-green-50 border-green-200",
    "Double-Crank":             "text-blue-700 bg-blue-50 border-blue-200",
    "Rocker-Crank":             "text-purple-700 bg-purple-50 border-purple-200",
    "Grashof Double-Rocker":    "text-yellow-700 bg-yellow-50 border-yellow-200",
    "Change-Point":             "text-orange-700 bg-orange-50 border-orange-200",
    "Non-Grashof Double-Rocker":"text-red-700 bg-red-50 border-red-200",
  };

  const rotationLabel = (result: SynthesisResult): React.ReactNode => {
    if (result.status !== "success") return null;

    if (result.followerIsDriver) {
      // Rocker-Crank: input rocks, output (follower) fully rotates
      return (
        <span className="text-purple-600">
          ↺ Output link: full rotation · Input link: rocker
        </span>
      );
    }

    if (result.canFullRotate) {
      if (result.grashof === "Double-Crank") {
        return (
          <span className="text-blue-600">
            ↺ Input link: full rotation · Output link: full rotation
          </span>
        );
      }
      // Crank-Rocker
      return (
        <span className="text-green-600">
          ↺ Input link: full rotation · Output link: rocker
        </span>
      );
    }

    // Non-Grashof / Grashof Double-Rocker / Change-Point
    return (
      <span className="text-amber-600">
        ⚠ Input link: rocker (limited swing)
      </span>
    );
  };

  return (
    <div className="absolute bottom-4 right-4 bg-white border border-gray-200 p-4 shadow-lg rounded-lg text-sm w-72 z-10">
      <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">
        Linkage Analysis
      </h3>

      {result.status === "error" && (
        <div className="text-red-600 text-xs">❌ {result.error}</div>
      )}

      {result.status === "success" && result.lengths && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-gray-500">Ground:</span>
            <span className="text-right font-mono">
              {result.lengths.ground.toFixed(2)}
            </span>
            <span className="text-gray-500">Crank:</span>
            <span className="text-right font-mono">
              {result.lengths.crank.toFixed(2)}
            </span>
            <span className="text-gray-500">Coupler AB:</span>
            <span className="text-right font-mono">
              {result.lengths.coupler.toFixed(2)}
            </span>
            <span className="text-gray-500">Follower:</span>
            <span className="text-right font-mono">
              {result.lengths.follower.toFixed(2)}
            </span>
          </div>

          {result.couplerTriangle && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2 pt-2 border-t border-gray-100">
              <span className="text-gray-400">Coupler AC (r):</span>
              <span className="text-right font-mono text-gray-400">
                {result.couplerTriangle.AC.toFixed(2)}
              </span>
              <span className="text-gray-400">Coupler BC:</span>
              <span className="text-right font-mono text-gray-400">
                {result.couplerTriangle.BC.toFixed(2)}
              </span>
            </div>
          )}

          {result.grashof && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                  grashofColors[result.grashof] || ""
                }`}
              >
                {result.grashof}
              </span>
              {result.grashofValues && (
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  s+ℓ = {result.grashofValues.sPlusL.toFixed(2)}, p+q ={" "}
                  {result.grashofValues.pPlusQ.toFixed(2)}
                </div>
              )}
              <div className="text-xs mt-1">
                {rotationLabel(result)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}