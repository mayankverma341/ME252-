import React from "react";
import type { Synthesis5Result } from "../../lib/synthesis5/types";
import { PAIR_COMBINATIONS } from "../../lib/synthesis5/remap";
import { useSynthesis5Store } from "../../store/useSynthesis5Store";

interface Props { result: Synthesis5Result | null; }

const grashofColors: Record<string, string> = {
  "Crank-Rocker":              "text-green-700 bg-green-50 border-green-200",
  "Double-Crank":              "text-blue-700 bg-blue-50 border-blue-200",
  "Rocker-Crank":              "text-purple-700 bg-purple-50 border-purple-200",
  "Grashof Double-Rocker":     "text-yellow-700 bg-yellow-50 border-yellow-200",
  "Change-Point":              "text-orange-700 bg-orange-50 border-orange-200",
  "Non-Grashof Double-Rocker": "text-red-700 bg-red-50 border-red-200",
};

export default function AnalysisCard5({ result }: Props) {
  const alpha      = useSynthesis5Store((s) => s.alpha);
  const r          = useSynthesis5Store((s) => s.r);
  const pairChoice = useSynthesis5Store((s) => s.pairChoice);
  const combo      = PAIR_COMBINATIONS[pairChoice];

  if (!result) return null;

  return (
    <div className="bg-white border border-gray-200 p-4 shadow-lg rounded-lg text-sm w-72 max-h-96 overflow-y-auto">
      <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">Linkage Analysis</h3>

      {result.status === "error" && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-2">
          ❌ {result.error}
        </div>
      )}

      {result.status === "success" && result.lengths && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-gray-500">Ground |H_C H_R|:</span>
            <span className="text-right font-mono">{result.lengths.ground.toFixed(2)}</span>
            <span className="text-gray-500">Crank |H_C A₁|:</span>
            <span className="text-right font-mono">{result.lengths.crank.toFixed(2)}</span>
            <span className="text-gray-500">Coupler AB:</span>
            <span className="text-right font-mono">{result.lengths.coupler.toFixed(2)}</span>
            <span className="text-gray-500">Follower |H_R B₁|:</span>
            <span className="text-right font-mono">{result.lengths.follower.toFixed(2)}</span>
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
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                grashofColors[result.grashof] || ""
              }`}>
                {result.grashof}
              </span>
              {result.grashofValues && (
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  s+ℓ = {result.grashofValues.sPlusL.toFixed(2)}, p+q ={" "}
                  {result.grashofValues.pPlusQ.toFixed(2)}
                </div>
              )}
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">Active pair:</span>
              <span className="text-right text-gray-700 font-mono text-xs break-all">
                {combo.label}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Overlay α:</span>
              <span className="font-mono text-gray-700">
                {((alpha * 180) / Math.PI).toFixed(1)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Coupler r:</span>
              <span className="font-mono text-gray-700">{r.toFixed(1)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}