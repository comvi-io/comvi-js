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
import type { ComviQueueEntry as CoreQueueEntry, I18nPluginHostApi } from "@comvi/core";

/**
 * What the core discovery queue carries: `@comvi/core`'s published BASE `I18n`,
 * with loader and plugin capabilities living only in the subpaths. Deriving it
 * from the published entry keeps this hook assignable to `window.__COMVI__`.
 */
type QueueI18n = CoreQueueEntry["i"];

/**
 * The instance type the editor DRIVES. It registers a post-processor on every
 * instance it edits, so it only ever works with a host that has the
 * plugin-host surface composed onto it — `@comvi/core/plugins`
 * (`attachPlugins` / `.with(plugins())`), or a framework builder that composes
 * it for you. A bare base host may still be pushed onto the queue — it is
 * tracked and counted, it is simply not editable.
 */
type I18n = QueueI18n & I18nPluginHostApi;

/** v2 queue entry envelope pushed by new core */
export interface ComviQueueEntry {
  /** Core library version that produced the entry */
  v?: string;
  /** The exposed i18n instance */
  i: QueueI18n;
}

/** Dual-protocol hook installed in place of the raw queue array. */
export interface ComviHookApi {
  /** Brand marking an already-installed editor hook (idempotence) */
  readonly __comviEditorHook: true;
  /** First core version seen (envelope `v` or legacy registry `version`) */
  version: string | undefined;
  /** Live v1-compatible view of the tracked instances */
  readonly instances: Map<string, I18n>;
  push(entry: ComviQueueEntry | QueueI18n): void;
  remove(entry: ComviQueueEntry | QueueI18n): void;
  register(id: string, instance: QueueI18n): void;
  unregister(id: string): void;
  get(id?: string): I18n | undefined;
}

/** v1 legacy registry shape an old core may have installed before us. */
interface LegacyRegistryLike {
  version?: string;
  instances?: Map<string, QueueI18n>;
  register?: (id: string, instance: QueueI18n) => void;
}

let anonCounter = 0;

/**
 * The marker alone is NOT enough: it is forgeable, and a page that pollutes
 * `Object.prototype.__comviEditorHook` marks every object. Adopt only a global
 * that also carries the members every read needs — the same check core makes
 * before pushing (`core/devtools.ts`: `push` AND `remove`), plus the
 * `instances` map the status probe reads. A marked-but-non-conforming global
 * is a truthy non-conforming global: never clobbered, never adopted.
 */
function isEditorHook(g: unknown): g is ComviHookApi {
  if (!g || typeof g !== "object") {
    return false;
  }
  const h = g as Partial<ComviHookApi>;
  return (
    h.__comviEditorHook === true &&
    h.instances instanceof Map &&
    typeof h.push === "function" &&
    typeof h.remove === "function"
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
function toInstance(
  entry: ComviQueueEntry | QueueI18n,
): { instance: QueueI18n; version?: string } | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  // `i` is read as an OWN property: `in` walks the prototype chain, so a page
  // with a polluted `Object.prototype.i` would otherwise have every bare
  // instance read as an envelope and its own object tracked as the instance.
  if (Object.prototype.hasOwnProperty.call(entry, "i")) {
    const envelope = entry as ComviQueueEntry;
    if (!envelope.i || typeof envelope.i !== "object") {
      return null;
    }
    return {
      instance: envelope.i,
      version: typeof envelope.v === "string" ? envelope.v : undefined,
    };
  }
  return { instance: entry as QueueI18n };
}

function createHook(): ComviHookApi {
  const instances = new Map<string, I18n>();
  const idsByInstance = new Map<QueueI18n, string>();

  // Array-masquerading carrier: `Array.isArray(hook)` stays true, but the
  // OWN `push`/`remove` properties assigned below shadow Array.prototype, so
  // new core's Array.isArray-first probe still routes through the hook's
  // push. This is a matched pair with core's probe order — never drop the
  // array masquerade or reorder core's probe independently, or one of the
  // two discovery paths silently bypasses the hook.
  const hook = [] as unknown as ComviHookApi & { version: string | undefined };

  const track = (instance: QueueI18n, version?: string, id?: string): void => {
    if (!instance || typeof instance !== "object") {
      return;
    }
    let resolvedId =
      id ?? idsByInstance.get(instance) ?? instance.instanceId ?? `comvi-anon-${++anonCounter}`;
    // Two copies of core on one page both mint `comvi-1`. Keying on the id
    // alone would drop the first instance from discovery the moment the second
    // announced itself, so a colliding id is DEDUPED rather than overwritten:
    // both instances stay discoverable and editable.
    const collided = instances.has(resolvedId) && instances.get(resolvedId) !== instance;
    while (instances.has(resolvedId) && instances.get(resolvedId) !== instance) {
      resolvedId = `${resolvedId}#${++anonCounter}`;
    }
    if (collided) {
      console.warn(
        `[ComviInContextEditor] Two i18n instances announced the same instanceId; tracking the second as "${resolvedId}". Two copies of @comvi/core on one page is the usual cause.`,
      );
    }
    const prevId = idsByInstance.get(instance);
    if (prevId !== undefined && prevId !== resolvedId) {
      instances.delete(prevId);
    }
    // The editor only ever hands these back out for editing; see `I18n`.
    instances.set(resolvedId, instance as I18n);
    idsByInstance.set(instance, resolvedId);
    if (version !== undefined && hook.version === undefined) {
      hook.version = version;
    }
  };

  const untrack = (instance: QueueI18n | undefined): void => {
    if (!instance) {
      return;
    }
    const id = idsByInstance.get(instance);
    if (id === undefined) {
      return;
    }
    idsByInstance.delete(instance);
    // Identity guard: only drop the slot while it still holds THIS instance.
    // Without it, a destroyed instance whose id was taken over by another live
    // one evicts that live one from discovery.
    if (instances.get(id) === instance) {
      instances.delete(id);
    }
  };

  Object.assign(hook, {
    __comviEditorHook: true as const,
    version: undefined as string | undefined,
    instances,
    push(entry: ComviQueueEntry | QueueI18n): void {
      const resolved = toInstance(entry);
      if (resolved) {
        track(resolved.instance, resolved.version);
      }
    },
    remove(entry: ComviQueueEntry | QueueI18n): void {
      untrack(toInstance(entry)?.instance);
    },
    register(id: string, instance: QueueI18n): void {
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
  // `Array.isArray` is probed BEFORE the marker, matching core's probe order:
  // a page that pollutes `Object.prototype.__comviEditorHook` must not be able
  // to make a legitimate raw queue array look like an installed hook.
  if (Array.isArray(existing)) {
    // An array-masquerading hook (ours, or the extension detector's) already
    // drained and swapped the global: reuse it, never swap twice.
    if (isEditorHook(existing)) {
      return existing;
    }
    const hook = createHook();
    // Swap FIRST so instances constructed mid-boot push into the hook, then
    // drain the snapshot ({v, i} envelopes AND bare legacy instances).
    window.__COMVI__ = hook;
    for (const raw of existing as Array<ComviQueueEntry | QueueI18n>) {
      hook.push(raw);
    }
    return hook;
  }
  if (isEditorHook(existing)) {
    return existing;
  }

  const hook = createHook();
  if (isLegacyRegistry(existing)) {
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

/**
 * Passive status probe — never installs or mutates the global.
 *
 * The hook branch comes first here (unlike the adoption path above) because an
 * installed hook IS an array: reading it as a raw queue would report `length`,
 * which the masquerade keeps at 0 forever. That is safe against a polluted
 * `Object.prototype.__comviEditorHook` because `isEditorHook` also requires
 * the `instances` map and the two methods, which a raw queue array lacks.
 */
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
