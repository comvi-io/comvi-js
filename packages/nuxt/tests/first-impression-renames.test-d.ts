import { describe, it, expectTypeOf } from "vitest";
import type { NuxtI18nOptions, NuxtI18nRuntimeConfig } from "../src/types";
import * as loadUtils from "../src/runtime/server/utils/loadMessages";

/**
 * 0.5 «first impression» renames on the Nuxt surface: the inline catalog is
 * `comvi.messages` (and so `runtimeConfig.public.comvi.messages`), the server
 * util is `loadMessages`. No aliases.
 */
describe("catalog vocabulary", () => {
  it("takes `messages` and rejects `translation`", () => {
    const valid: NuxtI18nOptions = {
      locales: ["en"],
      defaultLocale: "en",
      messages: { en: { hi: "Hi" } },
    };
    const invalid: NuxtI18nOptions = {
      locales: ["en"],
      defaultLocale: "en",
      // @ts-expect-error -- the option is `messages`.
      translation: { en: { hi: "Hi" } },
    };
    void [valid, invalid];
    expectTypeOf<NuxtI18nRuntimeConfig["comvi"]>().toHaveProperty("messages");
  });

  it("exports `loadMessages` and not `loadTranslations`", () => {
    expectTypeOf(loadUtils.loadMessages).toBeFunction();
    // @ts-expect-error -- the util is `loadMessages`.
    void loadUtils.loadTranslations;
  });
});
