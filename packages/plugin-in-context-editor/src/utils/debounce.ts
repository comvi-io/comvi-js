/**
 * Debounce utility function
 * Creates a debounced version of a function that delays invocation
 */

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * Creates a debounced version of a function
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): DebouncedFunction<T> {
  let timeoutId: number | null = null;

  const debouncedFn = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as DebouncedFunction<T>;

  debouncedFn.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFn;
}
