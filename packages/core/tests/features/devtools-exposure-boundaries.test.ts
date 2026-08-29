/**
 * The two ends of the discovery protocol that only show up at a BOUNDARY:
 * the probe order between a v2 hook and a v1 registry when the global carries
 * only half of either shape, and what a host that never pushed an entry may do
 * to a `window.__COMVI__` it meets later.
 *
 * `global-discovery.test.ts` covers the well-formed shapes; this file covers
 * the half-formed ones, plus the SSR case that `composition-hardening.test.ts`
 * only follows as far as the instance id: a host exposed WITHOUT a window has
 * an id but no queue entry, so every removal path must be a no-op for it —
 * removing "its" entry from a queue it never joined would take someone else's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import type { ComviQueueEntry } from "../../src";
import { attachDevtools } from "../../src/devtools";

const win = window as { __COMVI__?: unknown };

/** Two entries belonging to OTHER instances on the same page. */
const foreign = (): ComviQueueEntry[] =>
  [{ v: "0.0.1" }, { v: "0.0.2" }] as unknown as ComviQueueEntry[];

beforeEach(() => {
  delete win.__COMVI__;
});

afterEach(() => {
  delete win.__COMVI__;
});

describe("discovery probe order on a half-formed global", () => {
  it("prefers the legacy registry over a hook that can push but not remove", () => {
    const push = vi.fn();
    const register = vi.fn();
    win.__COMVI__ = { push, register };

    const i18n = attachDevtools(createI18n({ locale: "en" }), {
      exposeGlobal: true,
      instanceId: "half-hook",
    });

    expect(push).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith("half-hook", i18n);
  });

  it("prefers the legacy registry over a hook that can remove but not push", () => {
    const remove = vi.fn();
    const register = vi.fn();
    win.__COMVI__ = { remove, register };

    const i18n = attachDevtools(createI18n({ locale: "en" }), {
      exposeGlobal: true,
      instanceId: "remove-only",
    });

    expect(register).toHaveBeenCalledWith("remove-only", i18n);
  });
});

describe("a host exposed without a window", () => {
  it("takes no instance id when there is neither a window nor an exposure request", () => {
    vi.stubGlobal("window", undefined);

    const i18n = attachDevtools(createI18n({ locale: "en" }));

    expect(i18n.instanceId).toBeUndefined();
  });

  it("removes nothing from a queue hook that only exists on the client", async () => {
    vi.stubGlobal("window", undefined);
    const i18n = attachDevtools(createI18n({ locale: "en" }), {
      exposeGlobal: true,
      instanceId: "ssr",
    });
    vi.unstubAllGlobals();

    const remove = vi.fn();
    win.__COMVI__ = { push: vi.fn(), remove };
    await i18n.destroy();

    expect(remove).not.toHaveBeenCalled();
  });

  it("splices nothing out of a queue array that only exists on the client", async () => {
    vi.stubGlobal("window", undefined);
    const i18n = attachDevtools(createI18n({ locale: "en" }), {
      exposeGlobal: true,
      instanceId: "ssr",
    });
    vi.unstubAllGlobals();

    const queue = foreign();
    win.__COMVI__ = queue;
    await i18n.destroy();

    expect(queue).toEqual(foreign());
  });
});

describe("a host that never exposed itself", () => {
  it("never unregisters from a legacy registry on destroy", async () => {
    const unregister = vi.fn();
    win.__COMVI__ = { register: vi.fn(), unregister };
    const i18n = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });

    await i18n.destroy();

    expect(i18n.instanceId).toBeUndefined();
    expect(unregister).not.toHaveBeenCalled();
  });
});
