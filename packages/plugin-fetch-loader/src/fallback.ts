import type { TranslationValue } from "@comvi/core";
import type { FallbackImport, FallbackMap } from "./options";
import { toError } from "./http-core";

/**
 * Resolution order:
 * 1. Exact key "locale:namespace"
 * 2. Shorthand "locale" (only if ns === defaultNs)
 */
export function resolveFallback(
  fallback: FallbackMap | undefined,
  locale: string,
  ns: string,
  defaultNs: string,
): FallbackImport | undefined {
  if (!fallback) return undefined;
  return fallback[`${locale}:${ns}`] || (ns === defaultNs ? fallback[locale] : undefined);
}

export interface FallbackLoadResult {
  attempted: boolean;
  data?: Record<string, TranslationValue>;
  error?: Error;
}

export async function tryFallback(
  fallback: FallbackMap | undefined,
  locale: string,
  ns: string,
  defaultNs: string,
  onSuccess?: (locale: string, ns: string) => void,
  onError?: (locale: string, ns: string, err: Error) => void,
): Promise<FallbackLoadResult> {
  const importFn = resolveFallback(fallback, locale, ns, defaultNs);
  if (!importFn) return { attempted: false };
  try {
    const mod = await importFn();
    onSuccess?.(locale, ns);
    return { attempted: true, data: mod.default };
  } catch (e) {
    const error = toError(e);
    onError?.(locale, ns, error);
    return { attempted: true, error };
  }
}
