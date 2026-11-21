import type { Page } from "@playwright/test";
import {
  closeDialog,
  dialog,
  enable,
  expect,
  framesIn,
  openEditor,
  openSite,
  POLL,
  save,
  test,
  typeInto,
  visibleText,
  withGateE,
} from "./site";

/**
 * Owner update 2026-11-19, item 3a: the recorded limit "a pair's extent can go stale when only
 * the node with the closing frame changes", checked by its visible result. An ordinary update
 * — a save, or the app re-rendering the same key — must keep click and highlight on the right
 * translation: the right key, and a highlight box over that translation's element, not a
 * neighbour's or a stale node's.
 *
 * `#A-combo` holds two translations in one element, a rich pair and a plain string after it
 * (`rich.terms` · `nav.about`): a click on the bold part lies inside the pair and must open
 * `rich.terms` alone; a click elsewhere in the element offers both, each once.
 */
test.describe.configure({ timeout: 90_000 });

/** Alt-hover `selector`; the highlighter's overlay box and tooltip text. */
async function highlight(page: Page, selector: string) {
  await page.mouse.move(0, 0);
  await page.keyboard.down("Alt");
  try {
    await page.locator(selector).hover();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>("[data-comvi-editor-ui]")].some(
              (el) => el.textContent !== "" && getComputedStyle(el).opacity === "1",
            ),
          ),
        POLL,
      )
      .toBe(true);
    return await page.evaluate(() => {
      const ui = [...document.querySelectorAll<HTMLElement>("[data-comvi-editor-ui]")].filter(
        (el) => getComputedStyle(el).opacity === "1",
      );
      const box = ui.find((el) => el.textContent === "")!.getBoundingClientRect();
      return {
        tooltip: ui.find((el) => el.textContent !== "")!.textContent,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    });
  } finally {
    await page.keyboard.up("Alt");
  }
}

/** Where an element's highlight box must be: its own box, grown by the 2 px border. */
const boxOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width + 4, height: r.height + 4 };
  });

/** Alt-click and read what opened: the dialog's key, or the key selector's options. */
async function clickResult(page: Page, selector: string): Promise<string[]> {
  await page.locator(selector).click({ modifiers: ["Alt"] });
  const options = page.getByRole("option");
  await expect(dialog(page).or(options.first())).toBeVisible(POLL);
  if (await dialog(page).isVisible()) {
    const key = (await dialog(page).locator("code, .font-mono").first().textContent())?.trim();
    await closeDialog(page);
    return [`dialog:${key}`];
  }
  const texts = await options.allTextContents();
  // The selector listens for Escape from a task after it mounted: press until it closes.
  await expect
    .poll(async () => {
      await page.keyboard.press("Escape");
      return options.first().isHidden();
    }, POLL)
    .toBe(true);
  return texts.map((t) => t.replace(/\s+/g, " ").trim());
}

/** Replace, or rewrite in place, the text node that holds `#A-combo`'s closing frame. */
function changeClosingNode(page: Page, how: "replace" | "rewrite") {
  return page.evaluate((mode) => {
    const combo = document.getElementById("A-combo")!;
    const close = [...combo.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && /\u{E007E}\u{E002F}/u.test(n.nodeValue ?? ""),
    ) as Text;
    // The text between the bold part and the closing frame changes with it.
    const tail = close.previousSibling as Text;
    if (mode === "rewrite") {
      tail.nodeValue = " right now";
      close.nodeValue = `${close.nodeValue}`;
    } else {
      tail.replaceWith(document.createTextNode(" later on"));
      close.replaceWith(document.createTextNode(close.nodeValue ?? ""));
    }
  }, how);
}

test("an ordinary update keeps click and highlight on the right translation, plain and rich", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);
    await expect
      .poll(() => framesIn(page, "#A-combo"), POLL)
      .toEqual([
        { inst: "", ns: "default", key: "rich.terms", close: false },
        { inst: "", ns: "default", key: "rich.terms", close: true },
        { inst: "", ns: "default", key: "nav.about", close: false },
      ]);

    const check = async (label: string) => {
      await test.step(`${label}: the bold part opens rich.terms alone`, async () => {
        expect(await clickResult(page, "#A-combo b")).toEqual(["dialog:rich.terms"]);
      });
      await test.step(`${label}: the rest of the element offers both, each once`, async () => {
        const offered = await clickResult(page, "#A-combo");
        console.log(`[extents] ${label}: ${JSON.stringify(offered)}`);
        // Each once, and the pair's preview is the text the page shows now, not an old one.
        const shown = (await visibleText(page, "#A-combo")).split(" · ")[0];
        expect(offered.filter((t) => t.startsWith("rich.terms"))).toHaveLength(1);
        expect(offered.filter((t) => t.startsWith("nav.about"))).toEqual([
          'nav.about Text: "About us"',
        ]);
        expect(offered.find((t) => t.startsWith("rich.terms"))).toContain(`Text: "${shown}"`);
      });
      await test.step(`${label}: the highlight covers the element, its neighbours their own`, async () => {
        const combo = await highlight(page, "#A-combo b");
        expect(combo.box).toEqual(await boxOf(page, "#A-combo"));
        expect(combo.tooltip).toBe("rich.terms (+1)");
        const rich = await highlight(page, "#A-rich b");
        expect(rich).toEqual({ tooltip: "rich.terms", box: await boxOf(page, "#A-rich") });
      });
    };

    await check("as rendered");

    await test.step("a save re-renders the rich key with other content", async () => {
      await openEditor(page, "#A-rich b");
      await typeInto(page, "English", "Please read the <b>new terms</b> today");
      await save(page);
      await closeDialog(page);
      await expect
        .poll(() => visibleText(page, "#A-combo"), POLL)
        .toBe("Please read the new terms today · About us");
    });
    await check("after the save");

    await changeClosingNode(page, "rewrite");
    await expect
      .poll(() => visibleText(page, "#A-combo"), POLL)
      .toBe("Please read the new terms right now · About us");
    await check("after the closing node was rewritten in place");

    await changeClosingNode(page, "replace");
    await expect
      .poll(() => visibleText(page, "#A-combo"), POLL)
      .toBe("Please read the new terms later on · About us");
    await check("after the closing node was replaced");

    await test.step("plain: a re-rendered string keeps its key and its box", async () => {
      await page.evaluate(() => {
        const text = document.getElementById("A-title")!.firstChild as Text;
        text.nodeValue = text.nodeValue!.replace("Welcome home", "Welcome, again");
      });
      expect(await highlight(page, "#A-title")).toEqual({
        tooltip: "home.title",
        box: await boxOf(page, "#A-title"),
      });
      expect(await clickResult(page, "#A-title")).toEqual(["dialog:home.title"]);
    });
  });
});
