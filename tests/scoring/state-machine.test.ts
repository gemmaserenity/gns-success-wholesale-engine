import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../../src/domain/opportunities/state-machine";

describe("Phase 1 state machine", () => {
  it("allows an idempotent retry and the normal qualification path", () => {
    expect(canTransition("DISCOVERED", "DISCOVERED")).toBe(true);
    expect(canTransition("DISCOVERED", "NORMALIZED")).toBe(true);
    expect(canTransition("NORMALIZED", "PRELIM_SCREEN")).toBe(true);
    expect(canTransition("PRELIM_SCREEN", "QUALIFIED")).toBe(true);
  });

  it("blocks unaudited state skipping", () => {
    expect(() => assertTransition("DISCOVERED", "QUALIFIED")).toThrow("Invalid pipeline transition");
  });
});
