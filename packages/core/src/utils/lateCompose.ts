// The late-composition warning, shared by the loader and plugin capabilities.
//
// DEV-ONLY. Every call site guards with its own `IS_DEV`, so this module —
// the `WeakSet` included — is dropped from a production build. It is a LEAF
// (it imports only the logger) precisely so that `core/loader.ts` can use it
// without a hard edge into `core/plugins.ts`: dragging the plugin host into a
// base+loader module graph is the one thing the capability split exists to
// prevent.
//
// WHY ONE WARNING PER HOST, not one per capability: `.with(loader())`,
// `.with(plugins())` and `use()` after `init()` are the same single mistake
// wearing three hats, and each message already names the rule ("compose
// capabilities before init()"). Warning once per host means a chained
// `.with(loader()).with(plugins())` reports it once instead of twice; which
// of the two messages wins is call order, and either one is actionable.
import { warn } from "../logger";

/**
 * Hosts that have already been told. A `WeakSet` rather than a flag on the
 * instance: an own property would show up in the reflective contracts that
 * assert exactly what a composed host carries (`tests/root-contract.test.ts`).
 */
const warned = /* @__PURE__ */ new WeakSet<object>();

/** @internal Warn once per host. Guard the call site with `IS_DEV`. */
export function warnLateCompose(host: object, message: string): void {
  if (warned.has(host)) return;
  warned.add(host);
  warn(message);
}
