/**
 * window.__COMVI__ drain-and-swap hook — discovery protocol v2
 * (contracts/chrome-extension-proxy.json, "discovery" block).
 *
 * New core announces instances by pushing `{v, i}` envelopes onto a global
 * queue array. On boot the editor SWAPS that global for a hook object FIRST,
 * then drains the snapshot, so no concurrently-constructed instance is lost
 * (swap-then-drain). The hook speaks BOTH protocols:
 *   - v2: `push`/`remove` with `{v, i}` envelopes (new core)
 *   - v1 legacy: `register`/`unregister`/`get`/`instances` (an OLD core
 *     landing on a page where the new editor already swapped still attaches —
 *     its legacy code path calls `register(id, instance)`)
 */
import type { I18n } from "@comvi/core";

/** v2 queue entry envelope pushed by new core */
export interface ComviQueueEntry {
  /** Core library version that produced the entry */
  v?: string;
  /** The exposed i18n instance */
  i: I18n;
}

/** Dual-protocol hook installed in place of the raw queue array. */
export interface ComviHookApi {
  /** Brand marking an already-installed editor hook (idempotence) */
  readonly __comviEditorHook: true;
  /** First core version seen (envelope `v` or legacy registry `version`) */
  version: string | undefined;
  /** Live v1-compatible view of the tracked instances */
  readonly instances: Map<string, I18n>;
  push(entry: ComviQueueEntry | I18n): void;
  remove(entry: ComviQueueEntry | I18n): void;
  register(id: string, instance: I18n): void;
  unregister(id: string): void;
  get(id?: string): I18n | undefined;
}

/** v1 legacy registry shape an old core may have installed before us. */
interface LegacyRegistryLike {
  version?: string;
  instances?: Map<string, I18n>;
  register?: (id: string, instance: I18n) => void;
}

let anonCounter = 0;

function isEditorHook(g: unknown): g is ComviHookApi {
  return (
    !!g && typeof g === "object" && "__comviEditorHook" in g && g.__comviEditorHook === true
  );
}

function isLegacyRegistry(g: unknown): g is LegacyRegistryLike {
  if (!g || typeof g !== "object" || Array.isArray(g)) {
    return false;
  }
  const hasRegister = "register" in g && typeof g.register === "function";
  const hasInstances = "instances" in g && g.instances instanceof Map;
  return hasRegister || hasInstances;
}

/**
 * Accept either shape a queue slot may hold: a `{v, i}` envelope (new core)
 * or a bare legacy instance drained from a pre-existing array.
 */
function toInstance(entry: ComviQueueEntry | I18n): { instance: I18n; version?: string } | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if ("i" in entry) {
    if (!entry.i || typeof entry.i !== "object") {
      return null;
    }
    return { instance: entry.i, version: typeof entry.v === "string" ? entry.v : undefined };
  }
  return { instance: entry };
}

function createHook(): ComviHookApi {
  const instances = new Map<string, I18n>();
  const idsByInstance = new Map<I18n, string>();

  // Array-masquerading carrier: `Array.isArray(hook)` stays true, but the
  // OWN `push`/`remove` properties assigned below shadow Array.prototype, so
  // new core's Array.isArray-first probe still routes through the hook's
  // push. This is a matched pair with core's probe order — never drop the
  // array masquerade or reorder core's probe independently, or one of the
  // two discovery paths silently bypasses the hook.
  const hook = [] as unknown as ComviHookApi & { version: string | undefined };

  const track = (instance: I18n, version?: string, id?: string): void => {
    if (!instance || typeof instance !== "object") {
      return;
    }
    const resolvedId =
      id ?? idsByInstance.get(instance) ?? instance.instanceId ?? `comvi-anon-${++anonCounter}`;
    const prevId = idsByInstance.get(instance);
    if (prevId !== undefined && prevId !== resolvedId) {
      instances.delete(prevId);
    }
    instances.set(resolvedId, instance);
    idsByInstance.set(instance, resolvedId);
    if (version !== undefined && hook.version === undefined) {
      hook.version = version;
    }
  };

  const untrack = (instance: I18n | undefined): void => {
    if (!instance) {
      return;
    }
    const id = idsByInstance.get(instance);
    if (id !== undefined) {
      idsByInstance.delete(instance);
      instances.delete(id);
    }
  };

  Object.assign(hook, {
    __comviEditorHook: true as const,
    version: undefined as string | undefined,
    instances,
    push(entry: ComviQueueEntry | I18n): void {
      const resolved = toInstance(entry);
      if (resolved) {
        track(resolved.instance, resolved.version);
      }
    },
    remove(entry: ComviQueueEntry | I18n): void {
      untrack(toInstance(entry)?.instance);
    },
    register(id: string, instance: I18n): void {
      track(instance, undefined, id);
    },
    unregister(id: string): void {
      untrack(instances.get(id));
    },
    get(id?: string): I18n | undefined {
      if (id) {
        return instances.get(id);
      }
      return instances.values().next().value;
    },
  });

  return hook;
}

/**
 * v1 shim: copy the legacy registry's instances into the hook, then keep
 * mirroring late arrivals. The drained legacy object still dispatches
 * COMVI_READY from its own `register` if third-party code kept a reference
 * to it after the swap — pick those up too.
 */
function drainLegacyRegistry(legacy: LegacyRegistryLike, hook: ComviHookApi): void {
  if (hook.version === undefined && typeof legacy.version === "string") {
    hook.version = legacy.version;
  }
  const legacyInstances = legacy.instances;
  if (!legacyInstances) {
    return;
  }
  legacyInstances.forEach((instance, id) => hook.register(id, instance));
  window.addEventListener("COMVI_READY", (event) => {
    const id = (event as CustomEvent<{ instanceId?: string }>).detail?.instanceId;
    if (!id) {
      return;
    }
    const instance = legacyInstances.get(id);
    if (instance) {
      hook.register(id, instance);
    }
  });
}

/**
 * Install (or return the already-installed) dual-protocol hook on
 * window.__COMVI__: swap first, then drain. Returns null when there is no
 * window, or when a truthy non-conforming global occupies the slot (never
 * clobber someone else's value).
 */
export function ensureComviHook(): ComviHookApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  const existing: unknown = window.__COMVI__;
  if (isEditorHook(existing)) {
    return existing;
  }

  const hook = createHook();
  if (Array.isArray(existing)) {
    // Swap FIRST so instances constructed mid-boot push into the hook, then
    // drain the snapshot ({v, i} envelopes AND bare legacy instances).
    window.__COMVI__ = hook;
    for (const raw of existing as Array<ComviQueueEntry | I18n>) {
      hook.push(raw);
    }
  } else if (isLegacyRegistry(existing)) {
    window.__COMVI__ = hook;
    drainLegacyRegistry(existing, hook);
  } else if (!existing) {
    window.__COMVI__ = hook;
  } else {
    // truthy non-conforming global: never clobber
    return null;
  }
  return hook;
}

export interface ComviGlobalStatus {
  comviDetected: boolean;
  comviVersion: string | null;
  instanceCount: number;
}

/** Passive status probe — never installs or mutates the global. */
export function readComviGlobalStatus(): ComviGlobalStatus {
  const g: unknown = typeof window === "undefined" ? undefined : window.__COMVI__;
  if (isEditorHook(g)) {
    return {
      comviDetected: g.instances.size > 0,
      comviVersion: g.version ?? null,
      instanceCount: g.instances.size,
    };
  }
  if (Array.isArray(g)) {
    const first = g.length > 0 ? toInstance(g[0] as ComviQueueEntry | I18n) : null;
    return {
      comviDetected: g.length > 0,
      comviVersion: first?.version ?? null,
      instanceCount: g.length,
    };
  }
  if (isLegacyRegistry(g)) {
    return {
      comviDetected: true,
      comviVersion: typeof g.version === "string" ? g.version : null,
      instanceCount: g.instances?.size ?? 0,
    };
  }
  return { comviDetected: false, comviVersion: null, instanceCount: 0 };
}
