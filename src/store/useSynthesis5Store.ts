import { create } from "zustand";
import type { Point } from "../lib/geometry/math";

export interface Synthesis5State {
  precisionPoints: Point[];
  r: number;
  alpha: number;          // overlay rotation in radians
  pairChoice: number;     // 0–4
  swapA: [boolean, boolean, boolean, boolean, boolean];
  swap23: boolean;
  swap4: boolean;
  showConstruction: boolean;
  showGhosts: boolean;
  showCouplerCurve: boolean;

  isPlaying: boolean;
  speedRPM: number;
  crankAngle: number;
  rockerDirection: 1 | -1;

  zoom: number;
  panX: number;
  panY: number;

  placePoint: (p: Point) => void;
  clearAll: () => void;
  setr: (v: number) => void;
  setAlpha: (v: number) => void;
  setPairChoice: (i: number) => void;
  toggleSwapA: (i: number) => void;
  toggleSwap23: () => void;
  toggleSwap4: () => void;
  setShowConstruction: (v: boolean) => void;
  setShowGhosts: (v: boolean) => void;
  setShowCouplerCurve: (v: boolean) => void;

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

export const useSynthesis5Store = create<Synthesis5State>((set) => ({
  precisionPoints: [],
  r: 60,
  alpha: 0,
  pairChoice: 0,
  swapA: [false, false, false, false, false],
  swap23: false,
  swap4: false,
  showConstruction: true,
  showGhosts: true,
  showCouplerCurve: true,

  isPlaying: false,
  speedRPM: 30,
  crankAngle: 0,
  rockerDirection: 1,

  zoom: 1,
  panX: 0,
  panY: 0,

  placePoint: (p) =>
    set((s) => ({
      precisionPoints:
        s.precisionPoints.length < 5
          ? [...s.precisionPoints, p]
          : s.precisionPoints,
    })),

  clearAll: () =>
    set({
      precisionPoints: [],
      crankAngle: 0,
      isPlaying: false,
      rockerDirection: 1,
    }),

  setr:     (r)     => set({ r }),
  setAlpha: (alpha) => set({ alpha }),

  setPairChoice: (i) =>
    set({
      pairChoice: i,
      // Reset all branch toggles when pair changes
      swapA: [false, false, false, false, false],
      swap23: false,
      swap4: false,
    }),

  toggleSwapA: (i) =>
    set((s) => {
      const next = [...s.swapA] as [boolean, boolean, boolean, boolean, boolean];
      next[i] = !next[i];
      return { swapA: next };
    }),

  toggleSwap23: () => set((s) => ({ swap23: !s.swap23 })),
  toggleSwap4:  () => set((s) => ({ swap4:  !s.swap4  })),

  setShowConstruction: (v) => set({ showConstruction: v }),
  setShowGhosts:       (v) => set({ showGhosts: v }),
  setShowCouplerCurve: (v) => set({ showCouplerCurve: v }),

  play:  () => set({ isPlaying: true  }),
  pause: () => set({ isPlaying: false }),

  resetAnimation: (startAngle = 0) =>
    set({ crankAngle: startAngle, isPlaying: false, rockerDirection: 1 }),

  setSpeed:           (v) => set({ speedRPM: v }),
  setCrankAngle:      (v) => set({ crankAngle: v }),
  setRockerDirection: (v) => set({ rockerDirection: v }),

  setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(20, z)) }),
  setPan:  (x, y) => set({ panX: x, panY: y }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
}));