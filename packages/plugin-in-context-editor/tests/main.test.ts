import { beforeEach, describe, expect, it, vi } from "vitest";

const { coreCtorMock, coreStartMock, coreStopMock } = vi.hoisted(() => ({
  coreCtorMock: vi.fn(),
  coreStartMock: vi.fn(),
  coreStopMock: vi.fn(),
}));

vi.mock("../src/Core", () => ({
  Core: class MockCore {
    constructor(...args: unknown[]) {
      coreCtorMock(...args);
    }

    start(): void {
      coreStartMock();
    }

    stop(): void {
      coreStopMock();
    }
  },
}));

import { init, stop } from "../src/main";

describe("manual editor lifecycle", () => {
  beforeEach(() => {
    coreCtorMock.mockClear();
    coreStartMock.mockClear();
    coreStopMock.mockClear();
  });

  it("starts a Core instance with the supplied options and stops it", () => {
    const options = { collectContext: false };

    init(options);
    stop();

    expect(coreCtorMock).toHaveBeenCalledWith(options);
    expect(coreStartMock).toHaveBeenCalledOnce();
    expect(coreStopMock).toHaveBeenCalledOnce();
  });
});
