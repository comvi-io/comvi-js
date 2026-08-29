import { describe, expect, it, vi } from "vitest";
import { createGenerationScheduler } from "../src/scheduler";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createGenerationScheduler", () => {
  it("should coalesce queued runs and apply the latest snapshot last", async () => {
    let currentSnapshot = "first";
    const entered = createDeferred();
    const releaseFirstRun = createDeferred();
    const appliedSnapshots: string[] = [];

    const runGeneration = vi.fn(async () => {
      const snapshot = currentSnapshot;
      if (snapshot === "first") {
        entered.resolve();
        await releaseFirstRun.promise;
      }

      appliedSnapshots.push(snapshot);
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: false });
    await entered.promise;

    currentSnapshot = "second";
    const secondRun = scheduleGeneration({ throwOnError: false });

    currentSnapshot = "third";
    const thirdRun = scheduleGeneration({ throwOnError: false });

    releaseFirstRun.resolve();
    await Promise.all([firstRun, secondRun, thirdRun]);

    expect(runGeneration).toHaveBeenCalledTimes(2);
    expect(appliedSnapshots).toEqual(["first", "third"]);
  });

  it("should return a distinct completion promise for a queued rerun", async () => {
    const entered = createDeferred();
    const releaseFirstRun = createDeferred();
    let invocations = 0;

    const runGeneration = vi.fn(async () => {
      invocations++;
      if (invocations === 1) {
        entered.resolve();
        await releaseFirstRun.promise;
      }
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: false });
    await entered.promise;

    const secondRun = scheduleGeneration({ throwOnError: false });

    expect(secondRun).not.toBe(firstRun);

    releaseFirstRun.resolve();
    await Promise.all([firstRun, secondRun]);
    expect(runGeneration).toHaveBeenCalledTimes(2);
  });

  it("rejects the queued rerun too when the active run fails, and drops the rerun", async () => {
    const entered = createDeferred();
    const releaseFirstRun = createDeferred();
    let invocations = 0;

    const runGeneration = vi.fn(async () => {
      invocations++;
      if (invocations === 1) {
        entered.resolve();
        await releaseFirstRun.promise;
        throw new Error("generation failed");
      }
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: true });
    await entered.promise;
    const queuedRun = scheduleGeneration({ throwOnError: false });

    releaseFirstRun.reject(new Error("generation failed"));

    await expect(firstRun).rejects.toThrow("generation failed");
    await expect(queuedRun).rejects.toThrow("generation failed");
    expect(runGeneration).toHaveBeenCalledTimes(1);
  });

  it("keeps throwOnError=true from a coalesced call when a later call passes false", async () => {
    const entered = createDeferred();
    const releaseFirstRun = createDeferred();
    const seenOptions: boolean[] = [];
    let invocations = 0;

    const runGeneration = vi.fn(async (options: { throwOnError: boolean }) => {
      seenOptions.push(options.throwOnError);
      invocations++;
      if (invocations === 1) {
        entered.resolve();
        await releaseFirstRun.promise;
      }
    });

    const scheduleGeneration = createGenerationScheduler(runGeneration);

    const firstRun = scheduleGeneration({ throwOnError: false });
    await entered.promise;
    const strictRun = scheduleGeneration({ throwOnError: true });
    const lenientRun = scheduleGeneration({ throwOnError: false });

    releaseFirstRun.resolve();
    await Promise.all([firstRun, strictRun, lenientRun]);

    expect(seenOptions).toEqual([false, true]);
  });
});
