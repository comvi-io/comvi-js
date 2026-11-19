/**
 * A real Core over a real DOM: one text node rendering two translations, then
 * Alt-click. Only the lazily loaded UI chunks are doubles, so the assertion is
 * what the scanner decoded reaching the key selector.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const showKeySelectorMock = vi.fn();
const showModalMock = vi.fn();

vi.mock("../src/KeySelector", () => ({
  showKeySelector: (...args: unknown[]) => showKeySelectorMock(...args),
  cleanup: () => undefined,
}));

vi.mock("../src/EditModal", () => ({
  showModal: (...args: unknown[]) => showModalMock(...args),
  cleanup: () => undefined,
}));

import { Core } from "../src/Core";
import { pageSession } from "./helpers/session";
import { TAG_ATTRIBUTES } from "../src/constants";
import { keyRef, marker } from "./helpers/frames";
import {
  cleanupDOM,
  flushDOMMutations,
  mockBoundingClientRect,
  simulateMouseEvent,
} from "./helpers";

describe("Core with a multi-key text node", () => {
  afterEach(() => {
    cleanupDOM();
  });

  it("Alt-click on <p>{{ t('hello') }} {{ t('bye') }}</p> → the key selector offers both keys", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const paragraph = document.createElement("p");
    paragraph.textContent = `Hello${marker(keyRef("hello"))} Bye${marker(keyRef("bye", "farewells"))}`;
    mockBoundingClientRect(paragraph, { top: 0, left: 0, width: 100, height: 30 });
    container.appendChild(paragraph);
    const page = pageSession();
    const core = new Core(
      { targetElement: container, tagAttributes: TAG_ATTRIBUTES },
      page.session,
    );
    core.start();
    await flushDOMMutations();

    simulateMouseEvent(paragraph, "click", { altKey: true });

    // The selector and the (absent) modal are decided in the same continuation,
    // so once the selector has opened, "no modal" is settled too.
    await vi.waitFor(() => expect(showKeySelectorMock).toHaveBeenCalled());
    expect({
      keyData: showKeySelectorMock.mock.calls[0]?.[0],
      instanceId: showKeySelectorMock.mock.calls[0]?.[4],
      modalOpened: showModalMock.mock.calls.length > 0,
    }).toEqual({
      keyData: [
        { inst: "", key: "hello", ns: "default", textPreview: "Hello" },
        { inst: "", key: "bye", ns: "farewells", textPreview: "Bye" },
      ],
      instanceId: core.getInstanceId(),
      modalOpened: false,
    });
    core.stop();
    page.end();
  });
});
