// Re-export from shared kinematics — the kinematic solver is identical.
// The 5-point tool uses the same four-bar solver; only synthesis differs.
export {
  solvePosition,
  solvePositionInverse,
  solveGhostPose,
  computeCouplerCurve,
  computeRockerLimits,
  computeRockerLimitsFollower,
  detectBranch,
  rockerTick,
  isAngleInRange,
  clampToRange,
} from "../synthesis/kinematic";

export type { KinematicPose, RockerLimits } from "../synthesis/kinematic";