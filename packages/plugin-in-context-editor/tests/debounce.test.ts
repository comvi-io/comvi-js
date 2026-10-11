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

  it("two calls, 99ms of a 100ms delay elapsed → nothing has fired yet", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 100);
    debounced("first");
    debounced("second");

    vi.advanceTimersByTime(99);

    expect(callback).not.toHaveBeenCalled();
  });

  it("two calls, the full 100ms delay elapsed → fires once with the latest arguments", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 100);
    debounced("first");
    debounced("second");
    vi.advanceTimersByTime(99);

    vi.advanceTimersByTime(1);

    expect(callback).toHaveBeenCalledExactlyOnceWith("second");
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

  it("delay 0, no timer tick yet → nothing has fired", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 0);

    debounced("now");

    expect(callback).not.toHaveBeenCalled();
  });

  it("delay 0, the next timer tick → fires once with the call's arguments", () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 0);
    debounced("now");

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

  describe("a call made 50ms after cancel() (100ms delay)", () => {
    function callAfterCancel() {
      const callback = vi.fn();
      const debounced = debounce(callback, 100);
      debounced("cancelled");
      debounced.cancel();
      vi.advanceTimersByTime(50);
      debounced("scheduled");
      return callback;
    }

    it("when the cancelled call would have been due → nothing fires early", () => {
      const callback = callAfterCancel();

      vi.advanceTimersByTime(50);

      expect(callback).not.toHaveBeenCalled();
    });

    it("its own 100ms delay elapsed → fires once with its arguments", () => {
      const callback = callAfterCancel();
      vi.advanceTimersByTime(50);

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledExactlyOnceWith("scheduled");
    });
  });

  describe("debounce() with maxWait", () => {
    /** Sustained calls every 100ms against delay 1000 / maxWait 250, stopped at t=200. */
    function sustainedCalls() {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });
      // Sustained calls every 100ms would keep resetting a pure trailing
      // debounce forever; maxWait must force a fire at ~250ms from the first.
      debounced("a");
      vi.advanceTimersByTime(100);
      debounced("b");
      vi.advanceTimersByTime(100);
      return { callback, debounced };
    }

    it("sustained calls, before maxWait → nothing has fired", () => {
      const { callback, debounced } = sustainedCalls();

      debounced("c");

      expect(callback).not.toHaveBeenCalled();
    });

    it("sustained calls, maxWait reached → fires once with the latest arguments", () => {
      const { callback, debounced } = sustainedCalls();
      debounced("c");

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledExactlyOnceWith("c");
    });

    /** One burst that fired at its 250ms ceiling, then a fresh burst started. */
    function secondBurst() {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });
      debounced("burst1");
      vi.advanceTimersByTime(250);
      return { callback, debounced };
    }

    it("first burst, maxWait reached → fires once", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 1000, { maxWait: 250 });
      debounced("burst1");

      vi.advanceTimersByTime(250);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("second burst, 249ms into its own window → it has not fired yet", () => {
      const { callback, debounced } = secondBurst();
      // New burst after the first fired — its own maxWait window applies.
      debounced("burst2");

      vi.advanceTimersByTime(249);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("second burst, its own maxWait reached → fires with its arguments", () => {
      const { callback, debounced } = secondBurst();
      debounced("burst2");
      vi.advanceTimersByTime(249);

      vi.advanceTimersByTime(1);

      expect({ calls: callback.mock.calls.length, last: callback.mock.lastCall }).toEqual({
        calls: 2,
        last: ["burst2"],
      });
    });

    it("trailing delay shorter than maxWait, 99ms of 100ms elapsed → nothing has fired", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 100, { maxWait: 5000 });
      debounced("only");

      vi.advanceTimersByTime(99);

      expect(callback).not.toHaveBeenCalled();
    });

    it("trailing delay shorter than maxWait, delay elapsed → fires once at the trailing delay", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 100, { maxWait: 5000 });
      debounced("only");

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledExactlyOnceWith("only");
    });

    it("trailing delay fired first → the maxWait timer adds no second, spurious call", () => {
      const callback = vi.fn();
      const debounced = debounce(callback, 100, { maxWait: 5000 });
      debounced("only");
      vi.advanceTimersByTime(100);

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

    describe("a second burst at t=950 after maxWait fired the first (delay 1000, maxWait 100)", () => {
      function burstAfterMaxWaitFire() {
        const callback = vi.fn();
        const debounced = debounce(callback, 1000, { maxWait: 100 });
        debounced("first-burst");
        vi.advanceTimersByTime(100);
        // t=950: the first burst's abandoned 1000ms trailing timer is due at t=1000,
        // 50ms before this burst's own 100ms ceiling.
        vi.advanceTimersByTime(850);
        return { callback, debounced };
      }

      it("first burst, maxWait reached → fires once with its arguments", () => {
        const callback = vi.fn();
        const debounced = debounce(callback, 1000, { maxWait: 100 });
        debounced("first-burst");

        vi.advanceTimersByTime(100);

        expect(callback).toHaveBeenCalledExactlyOnceWith("first-burst");
      });

      it("when the first burst's trailing timer would be due → the second burst is not cut short", () => {
        const { callback, debounced } = burstAfterMaxWaitFire();
        debounced("second-burst");

        vi.advanceTimersByTime(50);

        expect(callback).toHaveBeenCalledTimes(1);
      });

      it("second burst's own ceiling reached → fires with its arguments", () => {
        const { callback, debounced } = burstAfterMaxWaitFire();
        debounced("second-burst");
        vi.advanceTimersByTime(50);

        vi.advanceTimersByTime(50);

        expect({ calls: callback.mock.calls.length, last: callback.mock.lastCall }).toEqual({
          calls: 2,
          last: ["second-burst"],
        });
      });
    });

    describe("a second burst at t=950 after the trailing delay fired the first (delay 100, maxWait 1000)", () => {
      function burstAfterTrailingFire() {
        const callback = vi.fn();
        const debounced = debounce(callback, 100, { maxWait: 1000 });
        debounced("first-burst");
        vi.advanceTimersByTime(100);
        // t=950: the first burst's abandoned 1000ms ceiling is due at t=1000,
        // 50ms before this burst's own 100ms trailing delay.
        vi.advanceTimersByTime(850);
        return { callback, debounced };
      }

      it("first burst, trailing delay reached → fires once with its arguments", () => {
        const callback = vi.fn();
        const debounced = debounce(callback, 100, { maxWait: 1000 });
        debounced("first-burst");

        vi.advanceTimersByTime(100);

        expect(callback).toHaveBeenCalledExactlyOnceWith("first-burst");
      });

      it("when the first burst's ceiling would be due → the second burst is not cut short", () => {
        const { callback, debounced } = burstAfterTrailingFire();
        debounced("second-burst");

        vi.advanceTimersByTime(50);

        expect(callback).toHaveBeenCalledTimes(1);
      });

      it("second burst's own trailing delay reached → fires with its arguments", () => {
        const { callback, debounced } = burstAfterTrailingFire();
        debounced("second-burst");
        vi.advanceTimersByTime(50);

        vi.advanceTimersByTime(50);

        expect({ calls: callback.mock.calls.length, last: callback.mock.lastCall }).toEqual({
          calls: 2,
          last: ["second-burst"],
        });
      });
    });

    describe("a call made 50ms after cancel() (delay 1000, maxWait 100)", () => {
      function callAfterCancel() {
        const callback = vi.fn();
        const debounced = debounce(callback, 1000, { maxWait: 100 });
        debounced("cancelled");
        debounced.cancel();
        vi.advanceTimersByTime(50);
        debounced("scheduled");
        return callback;
      }

      it("when the cancelled call's ceiling would have been due → nothing fires early", () => {
        const callback = callAfterCancel();

        vi.advanceTimersByTime(50);

        expect(callback).not.toHaveBeenCalled();
      });

      it("its own 100ms ceiling reached → fires once with its arguments", () => {
        const callback = callAfterCancel();
        vi.advanceTimersByTime(50);

        vi.advanceTimersByTime(50);

        expect(callback).toHaveBeenCalledExactlyOnceWith("scheduled");
      });
    });

    describe("unset maxWait (the historical trailing debounce)", () => {
      // Regression pin for the two live 2-arg callers (ElementHighlighter's
      // scroll handler + the public `debounce` export): omitting options must
      // never introduce a maxWait ceiling — sustained calls defer indefinitely.
      function sustainedCalls(): ReturnType<typeof vi.fn> {
        const callback = vi.fn();
        const debounced = debounce(callback, 200);
        for (let t = 0; t < 200; t += 100) {
          debounced("keep-deferring");
          vi.advanceTimersByTime(100);
        }
        debounced("keep-deferring");
        return callback;
      }

      it("calls every 100ms for 300ms → nothing has fired", () => {
        const callback = sustainedCalls();

        vi.advanceTimersByTime(100);

        expect(callback).not.toHaveBeenCalled();
      });

      it("calls stop, the 200ms delay elapses after the last one → fires once", () => {
        const callback = sustainedCalls();
        vi.advanceTimersByTime(100);

        vi.advanceTimersByTime(200);

        expect(callback).toHaveBeenCalledTimes(1);
      });
    });
  });
});
