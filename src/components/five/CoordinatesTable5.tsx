import React from "react";
import type { Point } from "../../lib/geometry/math";
import type { Synthesis5Result } from "../../lib/synthesis5/types";
import { useSynthesis5Store } from "../../store/useSynthesis5Store";
import { PAIR_COMBINATIONS } from "../../lib/synthesis5/remap";

interface Props { result: Synthesis5Result | null; }

export default function CoordinatesTable5({ result }: Props) {
  const pts        = useSynthesis5Store((s) => s.precisionPoints);
  const pairChoice = useSynthesis5Store((s) => s.pairChoice);
  const combo      = PAIR_COMBINATIONS[pairChoice];

  const rows: { label: string; point: Point | undefined; color: string }[] = [];
  const pointColors = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316"];

  pts.forEach((p, i) =>
    rows.push({ label: `C${i + 1}`, point: p, color: pointColors[i] })
  );

  if (result?.A) {
    result.A.forEach((a, i) =>
      rows.push({ label: `A${i + 1}`, point: a, color: "#f59e0b" })
    );
  }
  if (result?.B1)
    rows.push({ label: "B₁", point: result.B1, color: "#10b981" });
  if (result?.HC)
    rows.push({ label: "H_C", point: result.HC, color: "#2563eb" });
  if (result?.HR)
    rows.push({ label: "H_R", point: result.HR, color: "#dc2626" });
  if (result?.point23)
    rows.push({
      label: `[${combo.beta[0]+1},${combo.beta[1]+1}]`,
      point: result.point23, color: "#6b7280"
    });
  if (result?.point4)
    rows.push({
      label: `pt${combo.ref+1}`,
      point: result.point4, color: "#6b7280"
    });

  if (rows.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 p-3 shadow-lg rounded-lg text-xs w-52 max-h-72 overflow-y-auto">
      <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">Coordinates</h3>
      <table className="w-full">
        <thead>
          <tr className="text-gray-400">
            <th className="text-left font-normal">Pt</th>
            <th className="text-right font-normal">x</th>
            <th className="text-right font-normal">y</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(
            (row) => row.point && (
              <tr key={row.label} className="select-all">
                <td className="py-0.5">
                  <span className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: row.color }} />
                  {row.label}
                </td>
                <td className="text-right font-mono">{row.point.x.toFixed(1)}</td>
                <td className="text-right font-mono">{row.point.y.toFixed(1)}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}