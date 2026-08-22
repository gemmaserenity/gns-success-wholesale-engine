import type { PipelineState } from "./types";

const allowedTransitions: Record<PipelineState, readonly PipelineState[]> = {
  DISCOVERED: ["NORMALIZED", "REJECTED"],
  NORMALIZED: ["PRELIM_SCREEN", "REJECTED"],
  PRELIM_SCREEN: ["QUALIFIED", "REJECTED"],
  REJECTED: [],
  QUALIFIED: ["PRELIM_SCREEN", "REJECTED"],
};

export function canTransition(from: PipelineState, to: PipelineState): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertTransition(from: PipelineState, to: PipelineState): void {
  if (!canTransition(from, to)) throw new Error(`Invalid pipeline transition: ${from} -> ${to}`);
}
