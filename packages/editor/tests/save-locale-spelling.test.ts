/**
 * A save whose platform language is spelled differently from the app's locale (owner update
 * 2026-11-19, item 3b): the platform answers `pt-BR`, the app runs `pt-br` (or the other way
 * round). Core keeps the app's own spelling and an `add()` under the other spelling would make
 * a second, one-key pair, so the editor looks the pair up canonically (case and `_`/`-`) and
 * writes with the APP's spelling. Two app pairs that differ only in spelling, neither exact,
 * are ambiguous: nothing is patched, nothing is guessed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { stripFrames } from "../src/marker";
import { pageSession } from "./helpers/session";

let page: ReturnType<typeof pageSession> | undefined;

afterEach(() => {
  page?.end();
  page = undefined;
});

describe("the local patch of a save matches the app's pair by canonical locale", () => {
  it.each([
    ["pt-br", "pt-BR"],
    ["pt-BR", "pt-br"],
    ["pt-BR", "PT_BR"],
  ])("the app's %s pair takes the value the platform saved for %s", (app, platform) => {
    page = pageSession({ locale: app, messages: { [app]: { greet: "Olá" } } });
    const [target] = page.session.list();

    page.session.patch(target!, "default", "greet", { [platform]: "Oi" });

    expect(stripFrames(page.i18n.t("greet"))).toBe("Oi");
    // Written under the app's spelling: no second pair spelled the platform's way.
    expect(Object.keys(target!.x.state().c.default ?? {})).toEqual([app]);
  });

  it("an exact pair wins over one that differs only in spelling", () => {
    page = pageSession({
      locale: "pt-BR",
      messages: { "pt-BR": { greet: "Olá" }, "pt-br": { greet: "Olá (b)" } },
    });
    const [target] = page.session.list();

    page.session.patch(target!, "default", "greet", { "pt-BR": "Oi" });

    expect(target!.x.read("default", "pt-BR")).toEqual({ greet: "Oi" });
    expect(target!.x.read("default", "pt-br")).toEqual({ greet: "Olá (b)" });
  });

  it("patches nothing when two app pairs match canonically and neither is exact", () => {
    page = pageSession({
      locale: "pt-br",
      messages: { "pt-br": { greet: "Olá" }, "PT-BR": { greet: "Olá (B)" } },
    });
    const [target] = page.session.list();

    page.session.patch(target!, "default", "greet", { "pt-BR": "Oi" });

    expect(target!.x.read("default", "pt-br")).toEqual({ greet: "Olá" });
    expect(target!.x.read("default", "PT-BR")).toEqual({ greet: "Olá (B)" });
    expect(Object.keys(target!.x.state().c.default ?? {}).sort()).toEqual(["PT-BR", "pt-br"]);
  });

  it("still creates no pair for a language the app never loaded (D6)", () => {
    page = pageSession({ locale: "en", messages: { en: { greet: "Hello" } } });
    const [target] = page.session.list();

    page.session.patch(target!, "default", "greet", { "pt-BR": "Oi" });

    expect(Object.keys(target!.x.state().c.default ?? {})).toEqual(["en"]);
  });
});
