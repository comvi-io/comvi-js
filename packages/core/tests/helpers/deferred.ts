/**
 * A promise whose settlement the TEST drives.
 *
 * Async tests in this package must never win a race with a sleep: hand the
 * loader (or whatever the subject awaits) `deferred.promise`, then resolve or
 * reject it from the test at the exact point the scenario calls for.
 *
 * Gotcha worth knowing before writing one of these: `_emit`
 * (`src/core/i18n.ts`) and `_preDestroy` (`src/core/plugins.ts`) SWALLOW
 * listener exceptions and route them to `reportError`. An `expect()` written
 * inside an event listener or a plugin cleanup can therefore never fail its
 * test — record the observation into a variable and assert it afterwards.
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
