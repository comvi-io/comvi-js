export interface GenerationRunOptions {
  throwOnError: boolean;
}

interface Deferred {
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function createGenerationScheduler(
  runGeneration: (options: GenerationRunOptions) => Promise<void>,
): (options: GenerationRunOptions) => Promise<void> {
  let activeRun: Promise<void> | null = null;
  let rerunRequested = false;
  let pendingThrowOnError = false;
  let pendingWaiters: Deferred[] = [];

  function settleWaiters(waiters: Deferred[], error?: unknown): void {
    for (const waiter of waiters) {
      if (error === undefined) {
        waiter.resolve();
      } else {
        waiter.reject(error);
      }
    }
  }

  return function scheduleGeneration(options: GenerationRunOptions): Promise<void> {
    const completion = new Promise<void>((resolve, reject) => {
      pendingWaiters.push({ resolve, reject });
    });

    pendingThrowOnError ||= options.throwOnError;

    if (activeRun !== null) {
      rerunRequested = true;
      return completion;
    }

    activeRun = (async () => {
      try {
        do {
          const currentWaiters = pendingWaiters;
          pendingWaiters = [];
          const currentOptions: GenerationRunOptions = {
            throwOnError: pendingThrowOnError,
          };

          rerunRequested = false;
          pendingThrowOnError = false;

          try {
            await runGeneration(currentOptions);
            settleWaiters(currentWaiters);
          } catch (error) {
            settleWaiters(currentWaiters, error);
            settleWaiters(pendingWaiters, error);
            pendingWaiters = [];
            break;
          }
        } while (rerunRequested);
      } finally {
        activeRun = null;
      }
    })();

    return completion;
  };
}
