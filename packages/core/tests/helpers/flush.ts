/**
 * Drains the microtask queue by crossing one macrotask boundary.
 *
 * The package's single deterministic flush: `await Promise.resolve()` advances
 * the queue by ONE tick, which is a claim about microtask counts rather than
 * about settlement. Awaiting this instead lets every already-scheduled
 * continuation run, so a negative assertion after it ("this promise has NOT
 * settled") is a real claim about the subject and not about tick arithmetic.
 *
 * It is not a sleep: the timer fires on the next macrotask turn, so nothing
 * here waits on wall-clock time.
 */
export const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
