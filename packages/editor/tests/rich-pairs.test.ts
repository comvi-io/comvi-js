/**
 * Rich output marked with PAIRED frames (`[open, ...parts, close]`), read by the real
 * scanner and Core over hand-built DOM shaped as the bindings render it: parts as sibling
 * nodes (React, Solid), or the whole message joined into one text node (Vue, Svelte, when
 * every part is a string). A click on any node inside a pair's extent opens that pair's key;
 * the innermost pair wins. The real bindings are `tests/bindings/rich.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
vi.mock("../src/EditModal", ui.mockEditModalModule);
vi.mock("../src/KeySelector", ui.mockKeySelectorModule);

import { Core } from "../src/Core";
import { encodeFrame } from "../src/marker";
import { cleanupDOM } from "./helpers";
import { altClickOpens, boxAll } from "./helpers/clickProbe";
import { pageSession } from "./helpers/session";

const open = (key: string) => encodeFrame("", "default", key);
const close = (key: string) => encodeFrame("", "default", key, true);
const text = (t: string) => document.createTextNode(t);
function el(tag: string, ...children: Node[]): HTMLElement {
  const element = document.createElement(tag);
  element.append(...children);
  return element;
}

let page: ReturnType<typeof pageSession>;
let core: Core;
let root: HTMLElement;

beforeEach(() => {
  page = pageSession();
  root = document.createElement("div");
  document.body.append(root);
  core = new Core({ targetElement: root }, page.session);
  core.start();
});

afterEach(() => {
  core.stop();
  page.end();
  ui.resetEditorUiMocks();
  cleanupDOM();
});

function render(node: HTMLElement): HTMLElement {
  root.append(node);
  boxAll(node);
  return node;
}

describe("a pair whose parts are sibling nodes", () => {
  it('[<a>Buy</a>, " now"] → a click on <a> and on the paragraph opens the key', async () => {
    const a = el("a", text("Buy"));
    const p = render(el("p", text(open("buy")), a, text(" now"), text(close("buy"))));

    expect([await altClickOpens(a), await altClickOpens(p)]).toEqual([
      { modal: "default:buy", into: page.i18n },
      { modal: "default:buy", into: page.i18n },
    ]);
  });

  it("[<strong>A</strong>, <em>B</em>] → a click on each part opens the key", async () => {
    const strong = el("strong", text("A"));
    const em = el("em", text("B"));
    render(el("p", text(open("ab")), strong, em, text(close("ab"))));

    expect([await altClickOpens(strong), await altClickOpens(em)]).toEqual([
      { modal: "default:ab", into: page.i18n },
      { modal: "default:ab", into: page.i18n },
    ]);
  });

  it("nested: a rich message inside a part of another → the innermost key at each depth", async () => {
    const inner = el("em", text("deep"));
    const part = el("b", text(open("inner")), inner, text(close("inner")));
    const outerPart = el("i", text("outer part"));
    render(el("p", text(open("outer")), part, outerPart, text(close("outer"))));

    expect([await altClickOpens(inner), await altClickOpens(outerPart)]).toEqual([
      { modal: "default:inner", into: page.i18n },
      { modal: "default:outer", into: page.i18n },
    ]);
  });

  it("nested with both pairs on one element → the innermost pair that encloses the click", async () => {
    const innerPart = el("a", text("x"));
    const outerPart = el("b", text("y"));
    render(
      el(
        "p",
        text(open("outer")),
        text(open("inner")),
        innerPart,
        text(close("inner")),
        outerPart,
        text(close("outer")),
      ),
    );

    expect([await altClickOpens(innerPart), await altClickOpens(outerPart)]).toEqual([
      { modal: "default:inner", into: page.i18n },
      { modal: "default:outer", into: page.i18n },
    ]);
  });

  it("adjacent: two rich messages in one paragraph → each part opens its own key", async () => {
    const first = el("a", text("one"));
    const second = el("a", text("two"));
    render(
      el(
        "p",
        text(open("first")),
        first,
        text(close("first")),
        text(open("second")),
        second,
        text(close("second")),
      ),
    );

    expect([await altClickOpens(first), await altClickOpens(second)]).toEqual([
      { modal: "default:first", into: page.i18n },
      { modal: "default:second", into: page.i18n },
    ]);
  });

  it("adjacent pairs, a click on the paragraph itself → both keys offered", async () => {
    const p = render(
      el(
        "p",
        text(open("first")),
        el("a", text("one")),
        text(close("first")),
        text(open("second")),
        el("a", text("two")),
        text(close("second")),
      ),
    );

    expect(await altClickOpens(p)).toEqual({ selector: ["default:first", "default:second"] });
  });

  it("the preview is the visible text of the extent", async () => {
    const p = render(
      el("p", text(open("buy")), el("a", text("Buy")), text(" now"), text(close("buy"))),
    );
    await altClickOpens(p);

    const data = [...core.getRegistry().get(p)!.nodes.values()][0]!;

    expect(data.textPreview).toBe("Buy now");
  });
});

describe("a pair inside one text node (all-string parts joined)", () => {
  it("open · text · close in one node → clickable, preview is the text between", async () => {
    const p = render(el("p", text(`${open("joined")}Buy now${close("joined")}`)));

    expect({
      opened: await altClickOpens(p),
      preview: [...core.getRegistry().get(p)!.nodes.values()][0]!.textPreview,
    }).toEqual({ opened: { modal: "default:joined", into: page.i18n }, preview: "Buy now" });
  });

  it("a pair split over adjacent text nodes of one run → one key", async () => {
    const p = render(el("p", text(open("run")), text("Buy"), text(" now"), text(close("run"))));

    expect(await altClickOpens(p)).toEqual({ modal: "default:run", into: page.i18n });
  });
});

// Review findings (lot 8): a closing frame split between adjacent text nodes after the
// parts; and a same-node pair with text around it.
describe("a closing frame split between adjacent text nodes", () => {
  const cut = (frame: string, at: number) => [frame.slice(0, at), frame.slice(at)];
  it.each([
    ["inside the payload", 10],
    ["between the start character and the payload", 2],
  ])("split %s → the pair keeps its extent and preview", async (_name, at) => {
    const [head, tail] = cut(close("buy"), at);
    const a = el("a", text("Buy"));
    const p = render(el("p", text(open("buy")), a, text(` now${head}`), text(tail!)));

    expect({
      opened: await altClickOpens(a),
      preview: [...core.getRegistry().get(p)!.nodes.values()][0]!.textPreview,
    }).toEqual({ opened: { modal: "default:buy", into: page.i18n }, preview: "Buy now" });
  });
});

describe("a pair inside one text node with text around it", () => {
  it("prefix · open · value · close · suffix → the preview is the value", async () => {
    const p = render(el("p", text(`Price: ${open("joined")}Buy now${close("joined")} today`)));

    expect({
      opened: await altClickOpens(p),
      preview: [...core.getRegistry().get(p)!.nodes.values()][0]!.textPreview,
    }).toEqual({ opened: { modal: "default:joined", into: page.i18n }, preview: "Buy now" });
  });
});

describe("a pair with its closing frame missing", () => {
  it("an opening frame alone reads as a suffix: clickable, preview is the text before it", async () => {
    const p = render(el("p", text(`Before${open("lone")}`), el("a", text("part"))));

    expect({
      opened: await altClickOpens(p),
      preview: [...core.getRegistry().get(p)!.nodes.values()][0]!.textPreview,
    }).toEqual({ opened: { modal: "default:lone", into: page.i18n }, preview: "Before" });
  });
});
