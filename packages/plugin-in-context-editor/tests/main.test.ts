/**
 * `src/main.ts` is pure delegation to `Core` plus one module-level handle, so
 * these tests pin the delegation contract against a `Core` double. The handle
 * survives imports, so each test gets a fresh copy of the module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { coreCtorMock, coreStartMock, coreStopMock, mockCoreModule, resetCoreMocks } =
  await vi.hoisted(() => import("./helpers/mockCore"));

vi.mock("../src/Core", mockCoreModule);

describe("manual editor lifecycle", () => {
  let main: typeof import("../src/main");

  beforeEach(async () => {
    vi.resetModules();
    resetCoreMocks();
    main = await import("../src/main");
  });

  it("starts a Core instance with the supplied options and stops it", () => {
    const options = { collectContext: false };

    main.init(options);
    main.stop();

    expect(coreCtorMock).toHaveBeenCalledExactlyOnceWith(options);
    expect(coreStartMock).toHaveBeenCalledOnce();
    expect(coreStopMock).toHaveBeenCalledOnce();
  });

  it("stop() before any init() constructs nothing and stops nothing", () => {
    main.stop();

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(coreStopMock).not.toHaveBeenCalled();
  });

  it("init() twice starts a second Core and stop() then stops only the newest", () => {
    main.init();
    main.init();
    main.stop();

    expect(coreCtorMock).toHaveBeenCalledTimes(2);
    expect(coreStartMock).toHaveBeenCalledTimes(2);
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });
});
