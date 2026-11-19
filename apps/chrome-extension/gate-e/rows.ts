import type { ConsoleMessage, Page } from "@playwright/test";
import {
  allFrames,
  apiLog,
  closeDialog,
  contextRequests,
  dialog,
  disable,
  enable,
  expect,
  field,
  framesIn,
  platformStore,
  POLL,
  save,
  test,
  typeInto,
  visibleText,
  type ApiRequest,
  type Launched,
} from "./site";

/**
 * The checklist of a framework row (frameworks.spec.ts, frameworks-ssr.spec.ts) and the
 * marker-hygiene probes the other specs share.
 */
/** Any tag character, the frame start and end included (U+E0020–U+E007F). */
export const TAG_CHARACTER = /[\u{E0020}-\u{E007F}]/u;

/** Every text node and attribute value of the document (shadow roots included) holding one. */
export async function tagCharactersInDocument(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const tag = new RegExp(source, "u");
    const found: string[] = [];
    const visit = (root: Node) => {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE && tag.test(node.nodeValue ?? "")) {
          found.push(`text of <${node.parentElement?.tagName.toLowerCase()}>`);
        }
        if (node instanceof Element) {
          for (const attr of node.attributes) {
            if (tag.test(attr.value)) found.push(`${node.tagName.toLowerCase()}[${attr.name}]`);
          }
          if (node.shadowRoot) visit(node.shadowRoot);
        }
      }
    };
    visit(document.documentElement);
    if (tag.test(document.title)) found.push("document.title");
    return found;
  }, TAG_CHARACTER.source);
}

/** What the page's instances hold: every pair `x.read()` returns, and `x.state()`. */
export async function instanceData(page: Page): Promise<string> {
  return page.evaluate(() => {
    const queue = (globalThis as any).__COMVI__ as { x: any }[];
    return JSON.stringify(
      queue.map(({ x }) => {
        const state = x.state();
        const pairs: Record<string, unknown> = {};
        // `c` is namespace → locale → slot (contract `stateFields`).
        for (const [ns, locales] of Object.entries(state.c ?? {})) {
          for (const locale of Object.keys(locales as object)) {
            pairs[`${ns}/${locale}`] = x.read(ns, locale);
          }
        }
        return { state, pairs };
      }),
    );
  });
}

/** Console warnings and errors and uncaught page errors, from every page of the context. */
export function recordProblems(launched: Launched): string[] {
  const problems: string[] = [];
  launched.context.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()} (${message.location().url})`);
    }
  });
  launched.context.on("weberror", (error) => problems.push(`pageerror: ${error.error().message}`));
  return problems;
}

/** Alt-click a point of `selector` (its left edge by default) until the dialog opens. */
export async function openAt(page: Page, selector: string, where: "left" | "center" = "left") {
  const target = page.locator(selector).first();
  await expect
    .poll(async () => {
      if (await dialog(page).isVisible()) return true;
      const box = await target.boundingBox();
      if (!box) return false;
      await target.click({
        modifiers: ["Alt"],
        position: where === "left" ? { x: 2, y: box.height / 2 } : undefined,
      });
      return dialog(page).isVisible();
    }, POLL)
    .toBe(true);
}

const saves = (log: ApiRequest[]) =>
  log.filter((entry) => entry.method === "PUT").map((entry) => JSON.parse(entry.body!));

const plain = (ns: string, key: string) => [{ inst: "", ns, key, close: false }];
const pair = (ns: string, key: string) => [
  { inst: "", ns, key, close: false },
  { inst: "", ns, key, close: true },
];

/**
 * The checklist of one framework row, on a page that is already open and booted. `problems`
 * collects the console from before the page opened; it must stay empty to the end.
 */
export async function frameworkRow(
  launched: Launched,
  popups: Parameters<typeof enable>[1],
  page: Page,
  tabId: number,
  problems: string[],
): Promise<void> {
  await test.step("before Enable no frame or tag character is anywhere on the page", async () => {
    expect(await visibleText(page, "#A-title")).toBe("Welcome home");
    expect(await tagCharactersInDocument(page)).toEqual([]);
  });

  // A reload would reset this; live edit must not need one.
  await page.evaluate(() => ((globalThis as any).__gateENoReload = true));
  await enable(launched, popups, page, tabId);

  await test.step("strings from t() and rich <T> output are marked with their key and namespace", async () => {
    await expect
      .poll(() => framesIn(page, "#A-title"), POLL)
      .toEqual(plain("default", "home.title"));
    expect(await framesIn(page, "#A-common")).toEqual(plain("common", "save"));
    expect(await framesIn(page, "#A-missing")).toEqual(plain("default", "missing.key"));
    expect(await framesIn(page, "#A-rich")).toEqual(pair("default", "rich.terms"));
    expect(await visibleText(page, "#A-rich")).toBe("Read the terms now");
    expect(await page.locator("#A-rich b").count()).toBe(1);
  });

  await test.step("a click on a plain string, on each part of the rich message and on a missing key opens that key", async () => {
    await openAt(page, "#A-title");
    await expect(dialog(page)).toContainText("home.title");
    await expect(field(page, "English")).toHaveValue("Welcome home", POLL);
    await closeDialog(page);

    await openAt(page, "#A-rich b", "center");
    await expect(dialog(page)).toContainText("rich.terms");
    await expect(field(page, "English")).toHaveValue("Read the <b>terms</b> now", POLL);
    await closeDialog(page);

    await openAt(page, "#A-rich");
    await expect(dialog(page)).toContainText("rich.terms");
    await expect(field(page, "English")).toHaveValue("Read the <b>terms</b> now", POLL);
    await closeDialog(page);

    await openAt(page, "#A-missing");
    await expect(dialog(page)).toContainText("missing.key");
    await expect(field(page, "English")).toHaveValue("", POLL);
    await closeDialog(page);
  });

  await test.step("a save of another namespace's key reaches the platform and shows on the page", async () => {
    await openAt(page, "#A-common");
    await expect(field(page, "English")).toHaveValue("Save", POLL);
    await typeInto(page, "English", "Store it");
    expect(await save(page)).toContain("Saved");
    await expect.poll(() => visibleText(page, "#A-common"), POLL).toBe("Store it");
    await closeDialog(page);
  });

  await test.step("a save of the rich message renders its new parts through the framework", async () => {
    await openAt(page, "#A-rich b", "center");
    await typeInto(page, "English", "Please read the <b>new terms</b> today");
    expect(await save(page)).toContain("Saved");
    await expect
      .poll(() => visibleText(page, "#A-rich"), POLL)
      .toBe("Please read the new terms today");
    expect(await page.locator("#A-rich b").textContent()).toBe("new terms");
    expect(await framesIn(page, "#A-rich")).toEqual(pair("default", "rich.terms"));
    await closeDialog(page);
  });

  await test.step("a missing key is created by a save and shown at once", async () => {
    await openAt(page, "#A-missing");
    await typeInto(page, "English", "Now it exists");
    expect(await save(page)).toContain("Saved");
    await expect.poll(() => visibleText(page, "#A-missing"), POLL).toBe("Now it exists");
    await closeDialog(page);
  });

  await test.step("the platform got the right keys and namespaces, without a reload or a frame", async () => {
    expect(saves(await apiLog()).map((s) => `${s.namespace}:${s.key}`)).toEqual([
      "common:save",
      "default:rich.terms",
      "default:missing.key",
    ]);
    expect((await platformStore()).common.save.en).toBe("Store it");
    expect(await page.evaluate(() => (globalThis as any).__gateENoReload)).toBe(true);
    for (const request of await apiLog()) {
      expect(TAG_CHARACTER.test(request.body ?? ""), request.path).toBe(false);
    }
    const data = await instanceData(page);
    // Not vacuous: every loaded pair was read back through x.read().
    expect(Object.keys(JSON.parse(data)[0].pairs)).toEqual(
      expect.arrayContaining(["default/en", "common/en"]),
    );
    expect(TAG_CHARACTER.test(data)).toBe(false);
  });

  // What the app wrote once, outside its rendering (a title set once, a value written to the
  // DOM by hand): Disable re-renders the app's output, not this.
  await page.evaluate(() => {
    const kept = document.createElement("p");
    kept.id = "kept";
    kept.textContent = document.getElementById("A-title")!.textContent;
    document.body.append(kept);
  });
  await disable(launched, popups, page, tabId);

  await test.step("after Disable the rendered strings lose their frames and new output has none", async () => {
    await expect.poll(() => framesIn(page, "#region-A"), POLL).toEqual([]);
    // The documented limit: a string the app kept outside its rendering keeps its frame.
    expect(await framesIn(page, "#kept")).toEqual(plain("default", "home.title"));
    await page.locator("#kept").evaluate((el) => el.remove());
    expect(await allFrames(page)).toEqual([]);
    expect(await visibleText(page, "#A-common")).toBe("Store it");
    await page.locator("#more").click();
    await expect(page.locator("#A-late")).toHaveText("About us", POLL);
    expect(await tagCharactersInDocument(page)).toEqual([]);
  });

  expect(contextRequests(await apiLog())).toEqual([]);
  expect(problems, "framework warnings or errors in the console").toEqual([]);
}
