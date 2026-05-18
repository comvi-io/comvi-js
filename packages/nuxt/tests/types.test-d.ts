import { describe, it, expectTypeOf } from "vitest";
import type { UseI18nReturn as VueUseI18nReturn } from "@comvi/vue";
import type { UseI18nReturn as NuxtUseI18nReturn } from "../src/runtime/composables/useI18n";

describe("UseI18nReturn type parity", () => {
  it("Nuxt UseI18nReturn structurally extends Vue UseI18nReturn", () => {
    expectTypeOf<NuxtUseI18nReturn>().toMatchTypeOf<VueUseI18nReturn>();
  });
});
