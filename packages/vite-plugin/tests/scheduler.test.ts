import { describe, expect, it, vi } from "vitest";
import { createGenerationScheduler } from "../src/scheduler";

describe("createGenerationScheduler", () => {
  it("should coalesce queued runs and apply the latest snapshot last", async () => {
    let currentSnapshot = "first";
    let releaseFirstRun: (() => void) | undefined;
    const appliedSnapshots: string[] = [];

    const runGeneration = vi.fn(async () => {
      const snapshot = currentSnapshot;
      if (snapshot === "first") {
        await new Promise<void>((resolve) => {
          releaseFirstRun = resolve;
        });
      }

      appliedSnapshots.push(snapshot);
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: false });
    while (releaseFirstRun === undefined) {
      await Promise.resolve();
    }

    currentSnapshot = "second";
    const secondRun = scheduleGeneration({ throwOnError: false });

    currentSnapshot = "third";
    const thirdRun = scheduleGeneration({ throwOnError: false });

    releaseFirstRun?.();
    await Promise.all([firstRun, secondRun, thirdRun]);

    expect(runGeneration).toHaveBeenCalledTimes(2);
    expect(appliedSnapshots).toEqual(["first", "third"]);
  });

  it("should return a distinct completion promise for a queued rerun", async () => {
    let releaseFirstRun: (() => void) | undefined;

    const runGeneration = vi.fn(async () => {
      if (releaseFirstRun === undefined) {
        await new Promise<void>((resolve) => {
          releaseFirstRun = resolve;
        });
      }
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: false });
    while (releaseFirstRun === undefined) {
      await Promise.resolve();
    }

    const secondRun = scheduleGeneration({ throwOnError: false });

    expect(secondRun).not.toBe(firstRun);

    releaseFirstRun();
    await Promise.all([firstRun, secondRun]);
    expect(runGeneration).toHaveBeenCalledTimes(2);
  });
});
