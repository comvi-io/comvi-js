import { openSite, test, withGateE } from "./site";
import { frameworkRow, recordProblems } from "./rows";

/**
 * The framework rows: the lot-8 checklist on apps that React, Vue, Solid and Svelte render
 * themselves (gate-e/frameworks/<fw>/, built by frameworks/build.mjs from the workspace
 * bindings, with the real `cdn()` loader and `devtools()`), through the real popup, proxy and
 * editor. The SSR rows (Next, Nuxt) are frameworks-ssr.spec.ts.
 */
test.describe.configure({ timeout: 120_000 });

for (const framework of ["react", "vue", "solid", "svelte"]) {
  test(`${framework}: marking, every part opens its key, live edit and Disable, with a clean console`, async () => {
    await withGateE({}, async (launched, popups) => {
      const problems = recordProblems(launched);
      const { page, tabId } = await openSite(launched, `/fw/${framework}`);
      await frameworkRow(launched, popups, page, tabId, problems);
    });
  });
}
