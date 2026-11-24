/**
 * Review finding (lot 8): `findClose()` (TranslationScanner) collected the text of EVERY
 * following sibling before it decoded the first one, so reading N rich pairs side by side
 * cost N² node visits. It returns at the first closing frame again. Guarded by counted work
 * (sibling steps), never by time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
vi.mock("../src/EditModal", ui.mockEditModalModule);
vi.mock("../src/KeySelector", ui.mockKeySelectorModule);

import { Core } from "../src/Core";
import { encodeFrame } from "../src/marker";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { pageSession } from "./helpers/session";

let page: ReturnType<typeof pageSession> | undefined;
let core: Core | undefined;
afterEach(() => {
  core?.stop();
  page?.end();
  ui.resetEditorUiMocks();
  cleanupDOM();
  vi.restoreAllMocks();
});

/** Sibling steps taken while the scanner reads `n` closed rich pairs side by side. */
async function stepsFor(n: number): Promise<number> {
  page = pageSession();
  const root = document.createElement("div");
  document.body.append(root);
  core = new Core({ targetElement: root }, page.session);
  core.start();
  const p = document.createElement("p");
  for (let k = 0; k < n; k++) {
    const b = document.createElement("b");
    b.textContent = "part";
    p.append(encodeFrame("", "default", `k${k}`), b, encodeFrame("", "default", `k${k}`, true));
  }
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "nextSibling")!;
  let steps = 0;
  vi.spyOn(Node.prototype, "nextSibling", "get").mockImplementation(function (this: Node) {
    steps++;
    return descriptor.get!.call(this);
  });
  root.append(p);
  await flushDOMMutations();
  vi.restoreAllMocks();
  core.stop();
  page.end();
  core = undefined;
  page = undefined;
  cleanupDOM();
  return steps;
}

describe("finding the closing frame of a rich pair", () => {
  it("costs linear work in the number of pairs side by side", async () => {
    const small = await stepsFor(20);
    const large = await stepsFor(80);
    // Four times the pairs: about four times the steps (quadratic work would be sixteen).
    expect(large / small).toBeLessThan(6);
  });
});
