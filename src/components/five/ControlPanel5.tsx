import React from "react";
import { useSynthesis5Store } from "../../store/useSynthesis5Store";
import type { Synthesis5Result } from "../../lib/synthesis5/types";
import { PAIR_COMBINATIONS } from "../../lib/synthesis5/remap";

interface Props { result: Synthesis5Result | null; }

const SliderControl: React.FC<{
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <label className="flex flex-col text-sm gap-1">
    <span className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono text-gray-500">{value.toFixed(1)}</span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(+e.target.value)}
      className="w-full accent-blue-600" />
  </label>
);

const Toggle: React.FC<{
  label: string; description: string;
  checked: boolean; onChange: () => void;
}> = ({ label, description, checked, onChange }) => (
  <label className="flex items-start gap-2 cursor-pointer select-none group">
    <input type="checkbox" checked={checked} onChange={onChange}
      className="accent-blue-600 mt-0.5 flex-shrink-0" />
    <span>
      <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
      <span className="block text-xs text-gray-400 leading-snug mt-0.5">{description}</span>
    </span>
  </label>
);

function AnimationNotice({ result }: { result: Synthesis5Result | null }) {
  if (result?.status !== "success") return null;
  if (result.followerIsDriver)
    return <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-200">↺ Rocker-Crank — output link makes full rotation</div>;
  if (result.canFullRotate && result.grashof === "Double-Crank")
    return <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">↺ Double-Crank — both links make full rotation</div>;
  if (result.canFullRotate)
    return <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">↺ Crank-Rocker — input link makes full rotation</div>;
  return <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">⚠ Rocker mode — input link oscillates</div>;
}

export default function ControlPanel5({ result }: Props) {
  const s = useSynthesis5Store();
  const pointColors = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316"];
  const alphaDeg = (s.alpha * 180) / Math.PI;

  // Get active combo to build dynamic labels
  const combo = PAIR_COMBINATIONS[s.pairChoice];

  // Map internal positions to original C indices with labels
  // internal[0]=alpha[0], [1]=beta[0], [2]=beta[1], [3]=ref, [4]=alpha[1]
  const internalToOriginal = [
    combo.alpha[0],
    combo.beta[0],
    combo.beta[1],
    combo.ref,
    combo.alpha[1],
  ];

  // swapA[i] in store = swap for original index i
  // We display toggles in original order C1–C5
  const swapALabels = [0, 1, 2, 3, 4].map((origIdx) => {
    const internalPos = internalToOriginal.indexOf(origIdx);
    const isOnA23 = internalPos === 0 || internalPos === 1; // alpha[0] and beta[0] → a₂₃
    return {
      origIdx,
      label: `Swap A${origIdx + 1} branch`,
      description: isOnA23
        ? `Flips which r-arc intersection on a₂₃ is A${origIdx + 1} (C${origIdx + 1} side)`
        : `Flips which crank-circle intersection is A${origIdx + 1}`,
    };
  });

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-800">Five-Point Synthesis</h1>
        <p className="text-xs text-gray-400 mt-1">Two-Pair Reduction · Overlay Method</p>
      </div>

      {/* Precision Points */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-sm mb-2 text-gray-700">Precision Points</h2>
        {s.precisionPoints.length < 5 && (
          <p className="text-xs text-gray-500 mb-2">
            Click canvas to place {5 - s.precisionPoints.length} more
            point{5 - s.precisionPoints.length !== 1 ? "s" : ""}
          </p>
        )}
        <div className="space-y-1 mb-3">
          {s.precisionPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono">
              <span className="w-3 h-3 rounded-full flex-shrink-0 inline-block"
                style={{ backgroundColor: pointColors[i] }} />
              C{i + 1}: ({p.x.toFixed(1)}, {p.y.toFixed(1)})
            </div>
          ))}
        </div>
        <button onClick={s.clearAll}
          className="w-full py-1.5 text-sm bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 transition-colors">
          Clear All
        </button>
      </div>

      {s.precisionPoints.length === 5 && (
        <>
          {/* Pair Combination */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-sm mb-2 text-gray-700">
              Reduction Pair Combination
            </h2>
            <select value={s.pairChoice}
              onChange={(e) => s.setPairChoice(+e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PAIR_COMBINATIONS.map((c, i) => (
                <option key={i} value={i}>{c.label}</option>
              ))}
            </select>
            <div className="mt-2 text-xs text-gray-500 space-y-0.5">
              <div>
                <span className="text-red-400 font-medium">━ </span>
                Bisector of C{combo.alpha[0]+1}C{combo.alpha[1]+1}
              </div>
              <div>
                <span className="text-orange-400 font-medium">━ </span>
                Bisector of C{combo.beta[0]+1}C{combo.beta[1]+1}
              </div>
              <div className="text-gray-400">
                Reference point: C{combo.ref+1}
              </div>
            </div>
          </div>

          {/* Synthesis Parameters */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Synthesis Parameters</h2>
            <SliderControl
              label="α — overlay rotation (°)"
              value={alphaDeg} min={-180} max={180} step={0.5}
              onChange={(v) => s.setAlpha((v * Math.PI) / 180)} />
            <p className="text-xs text-gray-400 -mt-1">
              Rotates a₂₃ about H_R; determines H_C.
            </p>
            <SliderControl
              label="r — coupler distance |CᵢAᵢ|"
              value={s.r} min={-800} max={800} step={1}
              onChange={s.setr} />
          </div>

          {/* Branch Toggles — labels update with pair choice */}
          <div className="p-4 border-b border-gray-200 space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">Branch Toggles</h2>
            <p className="text-xs text-gray-400 mb-1">
              A₁/A₂ lie on a₂₃; A₃–A₅ lie on crank circle.
            </p>
            {swapALabels.map(({ origIdx, label, description }) => (
              <Toggle
                key={origIdx}
                label={label}
                description={description}
                checked={s.swapA[origIdx]}
                onChange={() => s.toggleSwapA(origIdx)}
              />
            ))}
            <Toggle
              label={`Swap [${combo.beta[0]+1},${combo.beta[1]+1}] branch`}
              description={`Flips orientation for combined inversion point of C${combo.beta[0]+1}C${combo.beta[1]+1}`}
              checked={s.swap23}
              onChange={s.toggleSwap23} />
            <Toggle
              label={`Swap point ${combo.ref+1} branch`}
              description={`Flips orientation for inversion of reference point C${combo.ref+1}`}
              checked={s.swap4}
              onChange={s.toggleSwap4} />
          </div>

          {/* Display */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Display</h2>
            <Toggle label="Show construction lines"
              description="Bisectors c₁₅, c₂₃, line a₂₃, a₁₂, crank circle"
              checked={s.showConstruction}
              onChange={() => s.setShowConstruction(!s.showConstruction)} />
            <Toggle label="Show ghost poses"
              description="Coupler triangle at each of the five precision points"
              checked={s.showGhosts}
              onChange={() => s.setShowGhosts(!s.showGhosts)} />
            <Toggle label="Show coupler curve"
              description="Full path traced by the coupler point"
              checked={s.showCouplerCurve}
              onChange={() => s.setShowCouplerCurve(!s.showCouplerCurve)} />
          </div>

          {/* Animation */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Animation</h2>
            <div className="flex gap-2">
              <button onClick={s.isPlaying ? s.pause : s.play}
                disabled={result?.status !== "success"}
                className="flex-1 py-1.5 text-sm rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                {s.isPlaying ? "⏸ Pause" : "▶️ Play"}
              </button>
              <button onClick={() => s.resetAnimation(result?.startAngle ?? 0)}
                className="flex-1 py-1.5 text-sm rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 transition-colors">
                🔄 Reset
              </button>
            </div>
            <SliderControl label="Speed (RPM)" value={s.speedRPM} min={1} max={120}
              onChange={s.setSpeed} />
            <div className="text-xs text-gray-500 font-mono">
              θ = {((s.crankAngle * 180) / Math.PI).toFixed(1)}°
            </div>
            <AnimationNotice result={result} />
          </div>

          {/* View */}
          <div className="p-4 border-b border-gray-200 space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">View</h2>
            <p className="text-xs text-gray-400">Scroll to zoom · Alt+drag or middle-drag to pan</p>
            <button onClick={s.resetView}
              className="w-full py-1.5 text-sm bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100 transition-colors">
              Reset View (⊙)
            </button>
          </div>
        </>
      )}
    </div>
  );
}