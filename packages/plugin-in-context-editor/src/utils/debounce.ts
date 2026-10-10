export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export interface DebounceOptions {
  /**
   * Upper bound (ms) on how long invocation may be deferred. When set, the
   * function is guaranteed to fire once `maxWait` ms have elapsed since the
   * FIRST un-fired call of a burst, even if trailing calls keep resetting the
   * `delay` timer. Left unset, `debounce` behaves as a pure trailing debounce
   * (identical to the historical two-argument form).
   */
  maxWait?: number;
}

/** The returned function carries a `cancel` method. */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
  options: DebounceOptions = {},
): DebouncedFunction<T> {
  const { maxWait } = options;
  let timeoutId: number | null = null;
  let maxTimeoutId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const invoke = (): void => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId !== null) {
      window.clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    const args = lastArgs;
    lastArgs = null;
    if (args) {
      fn(...args);
    }
  };

  const debouncedFn = ((...args: Parameters<T>) => {
    lastArgs = args;

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(invoke, delay);

    // Arm the max-wait ceiling once per burst: it is set on the first un-fired
    // call and left running (not reset by trailing calls) so it can bound the
    // total defer time. Cleared and re-armable after every invoke.
    if (maxWait !== undefined && maxTimeoutId === null) {
      maxTimeoutId = window.setTimeout(invoke, maxWait);
    }
  }) as DebouncedFunction<T>;

  debouncedFn.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId !== null) {
      window.clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    lastArgs = null;
  };

  return debouncedFn;
}
