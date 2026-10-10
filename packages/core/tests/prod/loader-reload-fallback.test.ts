/**
 * `reloadMessages()` with no active namespace left reloads the DEFAULT
 * namespace. Development also says so in a warning; production must not — the
 * message is a development-only string and nothing should reach the console.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

function recordingHost() {
  const loads: string[] = [];
  const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
  i18n.registerLoader(async (locale, namespace) => {
    loads.push(`${locale}:${namespace}`);
    return { key: "v" };
  });
  return { i18n, loads };
}

describe("reloadMessages() with no active namespace left", () => {
  it("reloads the default namespace", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespace("default");
    loads.length = 0;

    i18n.clearMessages(undefined, "default");
    await i18n.reloadMessages();

    expect(loads).toEqual(["en:default"]);
  });

  it("writes nothing to the console", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("default");

    i18n.clearMessages(undefined, "default");
    await i18n.reloadMessages();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
