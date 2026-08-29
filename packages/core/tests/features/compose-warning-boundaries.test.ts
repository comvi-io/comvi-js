/**
 * The two edges of the late-composition warning (`warnLateCompose`).
 *
 * `composition-hardening.test.ts` pins the warning itself; both of its
 * boundaries are open. On one side the supported order must be SILENT — its
 * suite composes before clearing the console spy, so a capability that warned
 * on every attach would go unnoticed. On the other side `.with(plugins())`
 * after `init()` must warn on its own, without a `use()` afterwards to raise
 * the warning for it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createI18n } from "../../src";
import { loader } from "../../src/loader";
import { plugins } from "../../src/plugins";

/** A host with a catalog, so `init()` needs no loader to succeed. */
const makeHost = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { hi: "Hi" } } });

describe("composing before init()", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("stays silent when the loader is composed onto a fresh host", () => {
    makeHost().with(loader());

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent when the plugin host is composed onto a fresh host", () => {
    makeHost().with(plugins());

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent when a plugin is queued on a host that has not been initialized", () => {
    makeHost()
      .with(plugins())
      .use(() => {});

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("composing after init()", () => {
  it("warns for `.with(plugins())` alone, with no plugin queued behind it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeHost();
    await i18n.init();
    warnSpy.mockClear();

    i18n.with(plugins());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("before init()");
  });
});
