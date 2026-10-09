/**
 * Nitro's `#imports`, as far as the server utilities use it.
 *
 * `useRuntimeConfig(event)` answers with what a test installed through
 * `setNitroRuntimeConfig`, and with nothing otherwise: a test that hands its
 * config over on `event.context.runtimeConfig` never reaches Nitro's.
 */
let nitroRuntimeConfig: unknown;

export function setNitroRuntimeConfig(config: unknown): void {
  nitroRuntimeConfig = config;
}

export function useRuntimeConfig(_event?: unknown): unknown {
  return nitroRuntimeConfig;
}
