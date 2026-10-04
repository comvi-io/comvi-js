/**
 * `<T>`'s `raw` prop was renamed to `skipPostProcess` in 0.5; `raw` stays as a
 * deprecated alias for one release, with a dev-only warning that fires once.
 * Mirrors `react/tests/T.behavior.test.tsx` and `solid/tests/T.test.tsx`'s
 * equivalent coverage.
 *
 * The warn-once dedupe is keyed by HOST identity (a `WeakSet` in
 * `src/components/T.ts`), not a single module-wide flag, so each test's own
 * `createI18n(...)` starts with no warning history regardless of what any
 * other test already did with a DIFFERENT host — no `vi.resetModules()` or
 * file-level isolation trick required.
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "../src/createI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

describe("<T /> deprecated raw prop warning", () => {
  it("warns once in development when raw is used, and not for skipPostProcess", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });

      mount(T, {
        props: { i18nKey: "greeting", skipPostProcess: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });
      expect(warn).not.toHaveBeenCalled();

      mount(T, {
        props: { i18nKey: "greeting", raw: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("<T raw>");
      expect(warn.mock.calls[0]![0]).toContain("<T skipPostProcess>");

      // A second use on the SAME host does not warn again.
      mount(T, {
        props: { i18nKey: "greeting", raw: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
      });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns again for a DIFFERENT host, even right after another host's warning", () => {
    const first = createI18n({ locale: "en" });
    const second = createI18n({ locale: "en" });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mount(T, {
        props: { i18nKey: "greeting", raw: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: first } },
      });
      expect(warn).toHaveBeenCalledTimes(1);

      mount(T, {
        props: { i18nKey: "greeting", raw: true },
        global: { provide: { [I18N_INJECTION_KEY as symbol]: second } },
      });
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
