import { create } from "zustand";
import type { Point } from "../lib/geometry/math";

export interface SynthesisState {
  precisionPoints: Point[];
  R: number;
  r: number;
  hrOffset: number;
  hcOffset: number;
  swapA1A3: boolean;
  swapA2: boolean;
  swapA4: boolean;
  showConstruction: boolean;
  showGhosts: boolean;
  showCouplerCurve: boolean;   // ← new

  isPlaying: boolean;
  speedRPM: number;
  crankAngle: number;
  rockerDirection: 1 | -1;

  zoom: number;
  panX: number;
  panY: number;

  placePoint: (p: Point) => void;
  clearAll: () => void;
  setR: (v: number) => void;
  setr: (v: number) => void;
  setHrOffset: (v: number) => void;
  setHcOffset: (v: number) => void;
  setSwapA1A3: (v: boolean) => void;
  setSwapA2: (v: boolean) => void;
  setSwapA4: (v: boolean) => void;
  setShowConstruction: (v: boolean) => void;
  setShowGhosts: (v: boolean) => void;
  setShowCouplerCurve: (v: boolean) => void;  // ← new
  play: () => void;
  pause: () => void;
  resetAnimation: (startAngle?: number) => void;
  setSpeed: (rpm: number) => void;
  setCrankAngle: (angle: number) => void;
  setRockerDirection: (dir: 1 | -1) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
}

export const useSynthesisStore = create<SynthesisState>((set) => ({
  precisionPoints: [],
  R: 80,
  r: 60,
  hrOffset: 20,
  hcOffset: 50,
  swapA1A3: false,
  swapA2: false,
  swapA4: false,
  showConstruction: true,
  showGhosts: true,
  showCouplerCurve: true,      // ← new

  isPlaying: false,
  speedRPM: 30,
  crankAngle: 0,
  rockerDirection: 1,

  zoom: 1,
  panX: 0,
  panY: 0,

  placePoint: (p) =>
    set((s) => ({
      precisionPoints: s.precisionPoints.length < 4
        ? [...s.precisionPoints, p]
        : s.precisionPoints,
    })),

  clearAll: () => set({
    precisionPoints: [], crankAngle: 0, isPlaying: false, rockerDirection: 1,
  }),

  setR:                (R)  => set({ R }),
  setr:                (r)  => set({ r }),
  setHrOffset:         (v)  => set({ hrOffset: v }),
  setHcOffset:         (v)  => set({ hcOffset: v }),
  setSwapA1A3:         (v)  => set({ swapA1A3: v }),
  setSwapA2:           (v)  => set({ swapA2: v }),
  setSwapA4:           (v)  => set({ swapA4: v }),
  setShowConstruction: (v)  => set({ showConstruction: v }),
  setShowGhosts:       (v)  => set({ showGhosts: v }),
  setShowCouplerCurve: (v)  => set({ showCouplerCurve: v }),  // ← new

  play:  () => set({ isPlaying: true  }),
  pause: () => set({ isPlaying: false }),

  resetAnimation: (startAngle = 0) =>
    set({ crankAngle: startAngle, isPlaying: false, rockerDirection: 1 }),

  setSpeed:           (v) => set({ speedRPM: v }),
  setCrankAngle:      (v) => set({ crankAngle: v }),
  setRockerDirection: (v) => set({ rockerDirection: v }),

  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(10, z)) }),
  setPan:  (x, y) => set({ panX: x, panY: y }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
}));