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

  it("defers to the next timer tick when delay is 0", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 0);

    debounced("now");

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledExactlyOnceWith("now");
  });

  it("cancel() with nothing pending leaves the debounced function usable", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 50);

    debounced.cancel();
    debounced("after-idle-cancel");
    vi.advanceTimersByTime(50);

    expect(callback).toHaveBeenCalledExactlyOnceWith("after-idle-cancel");
  });

  it("cancel() leaves no timer behind that could fire the next call early", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 100);

    debounced("cancelled");
    debounced.cancel();
    vi.advanceTimersByTime(50);
    debounced("scheduled");

    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledExactlyOnceWith("scheduled");
  });

  describe("debounce() with maxWait", () => {
    it("fires within maxWait of the first pending call under sustained calls", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });

      // Sustained calls every 100ms would keep resetting a pure trailing
      // debounce forever; maxWait must force a fire at ~250ms from the first.
      debounced("a");
      vi.advanceTimersByTime(100);
      debounced("b");
      vi.advanceTimersByTime(100);
      debounced("c");
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("c");
    });

    it("re-arms maxWait per burst (a fresh burst gets its own ceiling)", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });

      debounced("burst1");
      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(1);

      // New burst after the first fired — its own maxWait window applies.
      debounced("burst2");
      vi.advanceTimersByTime(249);
      expect(callback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith("burst2");
    });

    it("still honors the trailing delay when it elapses before maxWait", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 100, { maxWait: 5000 });

      debounced("only");
      vi.advanceTimersByTime(99);
      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("only");

      // maxWait timer must not produce a second, spurious call.
      vi.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("cancel() clears a pending maxWait timer too", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });

      debounced("x");
      debounced.cancel();
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it("disarms the trailing timer when maxWait fires, so a later burst is not cut short", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 100 });

      debounced("first-burst");
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledExactlyOnceWith("first-burst");

      // t=950: the first burst's abandoned 1000ms trailing timer is due at t=1000,
      // 50ms before this burst's own 100ms ceiling.
      vi.advanceTimersByTime(850);
      debounced("second-burst");

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith("second-burst");
    });

    it("disarms the maxWait timer when the trailing delay fires, so a later burst is not cut short", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 100, { maxWait: 1000 });

      debounced("first-burst");
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledExactlyOnceWith("first-burst");

      // t=950: the first burst's abandoned 1000ms ceiling is due at t=1000,
      // 50ms before this burst's own 100ms trailing delay.
      vi.advanceTimersByTime(850);
      debounced("second-burst");

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith("second-burst");
    });

    it("cancel() leaves no maxWait timer behind that could fire the next call early", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 100 });

      debounced("cancelled");
      debounced.cancel();
      vi.advanceTimersByTime(50);
      debounced("scheduled");

      vi.advanceTimersByTime(50);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledExactlyOnceWith("scheduled");
    });

    it("unset maxWait behaves exactly as the historical trailing debounce", () => {
      // Regression pin for the two live 2-arg callers (ElementHighlighter's
      // scroll handler + the public `debounce` export): omitting options must
      // never introduce a maxWait ceiling — sustained calls defer indefinitely.
      const callback = vi.fn();
      const debounced = debounce(callback, 200);

      for (let t = 0; t < 300; t += 100) {
        debounced("keep-deferring");
        vi.advanceTimersByTime(100);
      }
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
