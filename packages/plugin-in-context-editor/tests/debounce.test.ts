import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/utils/debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("invokes only once with the latest arguments after delay", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 100);

    debounced("first");
    debounced("second");

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("second");
  });

  it("cancels pending invocation", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 50);

    debounced("value");
    debounced.cancel();
    vi.advanceTimersByTime(60);

    expect(callback).not.toHaveBeenCalled();
  });

  it("can schedule a new invocation after cancel", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 30);

    debounced("cancelled");
    debounced.cancel();
    debounced("executed");
    vi.advanceTimersByTime(31);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("executed");
  });
});
