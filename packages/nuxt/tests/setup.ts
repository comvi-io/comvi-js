import { vi } from "vitest";

// The routing composables read the locale on screen through `useLocale()` (the binding's
// `locale` slice). Here it is the mock app's state `i18n-locale`, so a test sets it the way
// it sets the route and the runtime config.
vi.mock("../src/runtime/utils/locale", async () => {
  const { useState } = await import("./mocks/nuxt-app");
  return { useLocale: () => useState<string>("i18n-locale", () => "") };
});
