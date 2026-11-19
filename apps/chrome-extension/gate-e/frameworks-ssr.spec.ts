import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Response } from "@playwright/test";
import {
  closeDialog,
  enable,
  expect,
  field,
  framesIn,
  openSite,
  ORIGIN,
  POLL,
  save,
  test,
  typeInto,
  visibleText,
  withGateE,
} from "./site";
import { frameworkRow, openAt, recordProblems, TAG_CHARACTER } from "./rows";

/**
 * The SSR rows: Next (App Router, @comvi/next on Next 15) and Nuxt (@comvi/nuxt on Nuxt 4),
 * production builds of gate-e/frameworks/next and /nuxt (frameworks/build.mjs), served by
 * frameworks/serve.mjs and reached through the mock server (Next's `/en`, `/de`, `/_next`,
 * Nuxt's `/nuxt/`). The editor
 * is enabled AFTER the page loaded and hydrated: the server never marks, the browser marks
 * once the editor asks.
 */
test.describe.configure({ timeout: 150_000 });

const LOGS = join(import.meta.dirname, "../test-results");

/** What a server printed that a clean render does not: an error, a warning, a browser API. */
const SERVER_TROUBLE =
  /error|warn|window is not defined|document is not defined|navigator is not defined|localStorage|ReferenceError|TypeError/i;

const rows = [
  { name: "next", home: "/en", about: "/en/about", served: /^\/(en|de|_next)(\/|$|\?)/ },
  { name: "nuxt", home: "/nuxt/", about: "/nuxt/about", served: /^\/nuxt(\/|$)/ },
];

for (const row of rows) {
  test(`${row.name}: server HTML without frames, a clean hydration and server log, then marking, live edit and a client navigation`, async () => {
    await withGateE({}, async (launched, popups) => {
      const problems = recordProblems(launched);
      // Every document, RSC payload and JSON the app's origin answered while the test ran.
      const served: { url: string; body: string }[] = [];
      launched.context.on("response", async (response: Response) => {
        const url = response.url();
        const type = response.headers()["content-type"] ?? "";
        if (!url.startsWith(ORIGIN) || !row.served.test(url.slice(ORIGIN.length))) return;
        if (!/html|x-component|json/.test(type)) return;
        served.push({ url, body: await response.text().catch(() => "") });
      });
      const logBefore = readFileSync(join(LOGS, `ssr-${row.name}.log`), "utf8").length;

      const { page, tabId } = await openSite(launched, row.home);

      await test.step("the server HTML holds the rendered strings and no frame or tag character", async () => {
        const html = await (await fetch(`${ORIGIN}${row.home}`)).text();
        expect(html).toContain("Welcome home");
        expect(html).toContain("<b>terms</b>");
        expect(html).not.toMatch(TAG_CHARACTER);
        const document = served.find((entry) => entry.url === `${ORIGIN}${row.home}`);
        expect(document?.body ?? "", "the document the browser loaded").toContain("Welcome home");
      });

      await test.step("the page hydrated without a warning or an error", async () => {
        expect(problems, "console after hydration").toEqual([]);
      });

      await frameworkRow(launched, popups, page, tabId, problems);

      await enable(launched, popups, page, tabId);
      await expect.poll(() => framesIn(page, "#A-title"), POLL).toHaveLength(1);

      await test.step("after a client navigation the new page's strings are marked and editable", async () => {
        await page.evaluate(() => ((globalThis as any).__gateENavigated = true));
        await page.locator("#to-about").click();
        await expect(page.locator("#B-title")).toBeVisible(POLL);
        expect(await page.evaluate(() => (globalThis as any).__gateENavigated)).toBe(true);
        await expect
          .poll(() => framesIn(page, "#B-title"), POLL)
          .toEqual([{ inst: "", ns: "default", key: "home.title", close: false }]);
        expect(await framesIn(page, "#B-rich")).toHaveLength(2);
        await openAt(page, "#B-title");
        await expect(field(page, "English")).toHaveValue("Welcome home", POLL);
        await typeInto(page, "English", "Welcome back");
        expect(await save(page)).toContain("Saved");
        await expect.poll(() => visibleText(page, "#B-title"), POLL).toBe("Welcome back");
        await closeDialog(page);
      });

      await test.step("nothing the server sent during the session carried a frame", async () => {
        expect(served.length).toBeGreaterThan(0);
        for (const entry of served) expect(TAG_CHARACTER.test(entry.body), entry.url).toBe(false);
        const html = await (await fetch(`${ORIGIN}${row.about}`)).text();
        expect(html).toContain("Welcome back");
        expect(html).not.toMatch(TAG_CHARACTER);
      });

      await test.step("no hydration or framework warning in the console, and a clean server log", async () => {
        expect(problems, "console warnings or errors").toEqual([]);
        const log = readFileSync(join(LOGS, `ssr-${row.name}.log`), "utf8").slice(logBefore);
        const trouble = log.split("\n").filter((line) => SERVER_TROUBLE.test(line));
        expect(trouble, "server log").toEqual([]);
      });
    });
  });
}
