import type { I18nEvent, I18nEventData } from "../types";

/**
 * Canonical revision event set — every event after which translation output,
 * resolved config, or loading state observable through an i18n instance may
 * differ. This is the single source of truth for the wrappers' event→reactivity
 * bridges (vue/react/solid/svelte); do not hand-copy subsets into wrappers.
 */
export const REVISION_EVENTS = [
  "localeChanged",
  "namespaceLoaded",
  "loadingStateChanged",
  "initialized",
  "translationsCleared",
  "defaultNamespaceChanged",
  "configChanged",
] as const satisfies readonly I18nEvent[];

/** One of the canonical revision events (see {@link REVISION_EVENTS}). */
export type RevisionEvent = (typeof REVISION_EVENTS)[number];

/**
 * Structural event source — satisfied by `I18n` and by framework wrappers
 * that proxy `on` to a core instance.
 */
export interface RevisionEventSource {
  on<E extends I18nEvent>(event: E, callback: (data: I18nEventData[E]) => void): () => void;
}

/**
 * Subscribe `callback` to the canonical revision event set of an i18n instance.
 *
 * The callback receives the event name so bridges that maintain separate
 * reactive axes (locale, loading, cache/config revision) can route without
 * re-declaring the event list. Returns a disposer that removes all
 * subscriptions.
 *
 * @example
 * ```ts
 * let revision = 0;
 * const unsubscribe = subscribeToRevision(i18n, () => rerender(++revision));
 * ```
 */
export function subscribeToRevision(
  i18n: RevisionEventSource,
  callback: (event: RevisionEvent) => void,
): () => void {
  const unsubs = REVISION_EVENTS.map((event) => i18n.on(event, () => callback(event)));
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
