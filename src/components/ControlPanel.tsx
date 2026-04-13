import React from "react";
import { useSynthesisStore } from "../store/useSynthesisStore";
import type { SynthesisResult } from "../lib/synthesis/pipeline";

interface Props { result: SynthesisResult | null; }

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
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <label className="flex items-start gap-2 cursor-pointer select-none group">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-blue-600 mt-0.5 flex-shrink-0"
    />
    <span>
      <span className="text-sm text-gray-700 group-hover:text-gray-900">
        {label}
      </span>
      <span className="block text-xs text-gray-400 leading-snug mt-0.5">
        {description}
      </span>
    </span>
  </label>
);

function AnimationNotice({ result }: { result: SynthesisResult | null }) {
  if (result?.status !== "success") return null;

  if (result.followerIsDriver) {
    return (
      <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-200">
        ↺ Rocker-Crank — output link (follower) makes full rotation
      </div>
    );
  }

  if (result.canFullRotate && result.grashof === "Double-Crank") {
    return (
      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
        ↺ Double-Crank — both links make full rotation
      </div>
    );
  }

  if (result.canFullRotate) {
    return (
      <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
        ↺ Crank-Rocker — input link makes full rotation
      </div>
    );
  }

  return (
    <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
      ⚠ Rocker mode — input link oscillates between limits
    </div>
  );
}

export default function ControlPanel({ result }: Props) {
  const s = useSynthesisStore();
  const pointColors = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7"];

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-800">Four-Bar Synthesis</h1>
        <p className="text-xs text-gray-400 mt-1">Burmester Reduction Method</p>
      </div>

      {/* Precision Points */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-sm mb-2 text-gray-700">
          Precision Points
        </h2>
        {s.precisionPoints.length < 4 && (
          <p className="text-xs text-gray-500 mb-2">
            Click canvas to place {4 - s.precisionPoints.length} more
            point{4 - s.precisionPoints.length !== 1 ? "s" : ""}
          </p>
        )}
        <div className="space-y-1 mb-3">
          {s.precisionPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 inline-block"
                style={{ backgroundColor: pointColors[i] }}
              />
              C{i + 1}: ({p.x.toFixed(1)}, {p.y.toFixed(1)})
            </div>
          ))}
        </div>
        <button
          onClick={s.clearAll}
          className="w-full py-1.5 text-sm bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 transition-colors">
          Clear All
        </button>
      </div>

      {s.precisionPoints.length === 4 && (
        <>
          {/* Synthesis Parameters */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">
              Synthesis Parameters
            </h2>
            <SliderControl label="R (R-circle radius)" value={s.R} min={5} max={300} onChange={s.setR} />
            <SliderControl label="r (coupler dist)"    value={s.r} min={5} max={300} onChange={s.setr} />
            <SliderControl label="H_R offset" value={s.hrOffset} min={-300} max={300} onChange={s.setHrOffset} />
            <SliderControl label="H_C offset" value={s.hcOffset} min={-300} max={300} onChange={s.setHcOffset} />
          </div>

          {/* Branch Toggles */}
          <div className="p-4 border-b border-gray-200 space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">
              Branch Toggles
            </h2>
            <Toggle
              label="Swap A₁/A₃ side"
              description="Flips which intersection of the r-arc and R-circle is used for A₁"
              checked={s.swapA1A3}
              onChange={s.setSwapA1A3}
            />
            <Toggle
              label="Swap A₂ branch"
              description="Flips which intersection of the r-arc and crank circle is used for A₂"
              checked={s.swapA2}
              onChange={s.setSwapA2}
            />
            <Toggle
              label="Swap A₄ branch"
              description="Flips which intersection of the r-arc and crank circle is used for A₄"
              checked={s.swapA4}
              onChange={s.setSwapA4}
            />
          </div>

          {/* Display */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Display</h2>
            <Toggle
              label="Show construction lines"
              description="Bisectors, R-circle, r-arcs, crank circle, inversion points P₂/P₄"
              checked={s.showConstruction}
              onChange={s.setShowConstruction}
            />
            <Toggle
              label="Show ghost poses"
              description="A₁–A₄ crank pins, B₁, and the coupler triangle frozen at each precision point"
              checked={s.showGhosts}
              onChange={s.setShowGhosts}
            />
            <Toggle
              label="Show coupler curve"
              description="Full path traced by coupler point C, and the valid / dead-zone arc on the driving circle"
              checked={s.showCouplerCurve}
              onChange={s.setShowCouplerCurve}
            />
          </div>

          {/* Animation */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Animation</h2>
            <div className="flex gap-2">
              <button
                onClick={s.isPlaying ? s.pause : s.play}
                disabled={result?.status !== "success"}
                className="flex-1 py-1.5 text-sm rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                {s.isPlaying ? "⏸ Pause" : "▶️ Play"}
              </button>
              <button
                onClick={() => s.resetAnimation(result?.startAngle ?? 0)}
                className="flex-1 py-1.5 text-sm rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 transition-colors">
                🔄 Reset
              </button>
            </div>
            <SliderControl
              label="Speed (RPM)"
              value={s.speedRPM}
              min={1} max={120}
              onChange={s.setSpeed}
            />
            <div className="text-xs text-gray-500 font-mono">
              θ = {((s.crankAngle * 180) / Math.PI).toFixed(1)}°
            </div>
            <AnimationNotice result={result} />
          </div>

          {/* View Controls */}
          <div className="p-4 border-b border-gray-200 space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">View</h2>
            <p className="text-xs text-gray-400">
              Scroll to zoom · Alt+drag or middle-drag to pan
            </p>
            <button
              onClick={s.resetView}
              className="w-full py-1.5 text-sm bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100 transition-colors">
              Reset View (⊙)
            </button>
          </div>
        </>
      )}
    </div>
  );
}