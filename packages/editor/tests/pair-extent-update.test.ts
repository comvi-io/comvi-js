/**
 * Owner update 2026-11-19, item 3a: a pair's extent after an ordinary update. A rich pair's
 * data — its preview and the node of its closing frame — lives on the node of its OPENING
 * frame. When only the nodes after the bold part change (a binding updates the trailing text
 * and the closing frame, or replaces those nodes), the opening node is untouched: its data
 * must still be read again, or the key selector previews old text and the pair's extent ends
 * at a node no longer in the document. Found by Gate E `extents.spec.ts` (stale preview).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
vi.mock("../src/EditModal", ui.mockEditModalModule);
vi.mock("../src/KeySelector", ui.mockKeySelectorModule);

import { Core } from "../src/Core";
import { encodeFrame } from "../src/marker";
import type { NodeData } from "../src/types/translation";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { altClickOpens, boxAll } from "./helpers/clickProbe";
import { pageSession } from "./helpers/session";

const open = encodeFrame("", "default", "terms");
const close = encodeFrame("", "default", "terms", true);
const about = encodeFrame("", "default", "about");

let page: ReturnType<typeof pageSession>;
let core: Core;
let root: HTMLElement;
let p: HTMLElement;
let b: HTMLElement;

beforeEach(async () => {
  page = pageSession();
  root = document.createElement("div");
  document.body.append(root);
  core = new Core({ targetElement: root }, page.session);
  core.start();
  // [open, "Read the ", <b>terms</b>, " now", close] · "About us" + suffix: one element.
  b = document.createElement("b");
  b.append("terms");
  p = document.createElement("p");
  p.append(open, "Read the ", b, " now", close, " · ", `About us${about}`);
  root.append(p);
  boxAll(p);
  await flushDOMMutations();
});

afterEach(() => {
  core.stop();
  page.end();
  ui.resetEditorUiMocks();
  cleanupDOM();
});

/** The data the registry holds for the pair's opening node. */
function pair(): NodeData & { close?: Node } {
  for (const [, data] of core.getRegistry().get(p)?.nodes ?? []) {
    for (const d of (data as NodeData).markers ?? [data as NodeData])
      if (d.key === "terms") return d as NodeData & { close?: Node };
  }
  throw new Error("no pair registered");
}

const tailAndClose = () => {
  const closeNode = [...p.childNodes].find((n) => n.nodeValue === close) as Text;
  return { tail: closeNode.previousSibling as Text, closeNode };
};

describe("a pair whose closing side changes while its opening node stays", () => {
  it("reads the preview again when the text before the closing frame is rewritten in place", async () => {
    expect(pair().textPreview).toBe("Read the terms now");

    tailAndClose().tail.nodeValue = " right now";
    await flushDOMMutations();

    expect(pair().textPreview).toBe("Read the terms right now");
    expect(await altClickOpens(b)).toEqual({ modal: "default:terms", into: page.i18n });
  });

  it("ends the extent at the new closing node when the closing side is replaced", async () => {
    const { tail, closeNode } = tailAndClose();
    const newClose = document.createTextNode(close);
    tail.replaceWith(document.createTextNode(" later on"));
    closeNode.replaceWith(newClose);
    await flushDOMMutations();

    expect(pair().close).toBe(newClose);
    expect(pair().close?.isConnected).toBe(true);
    expect(pair().textPreview).toBe("Read the terms later on");
    expect(await altClickOpens(b)).toEqual({ modal: "default:terms", into: page.i18n });
    expect(await altClickOpens(p)).toEqual({ selector: ["default:terms", "default:about"] });
  });
});
