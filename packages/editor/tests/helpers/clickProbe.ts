/**
 * What an Alt-click opens, read through the UI doubles of `editorUiMocks.ts` (the suite
 * must install them with `vi.mock`): the one key the modal opened with and the instance a
 * save would write into, or every key the selector offered.
 */
import { expect, vi } from "vitest";
import type { Target } from "../../src/adapter";
import { flushDOMMutations, mockBoundingClientRect, simulateMouseEvent } from "../helpers";
import { showKeySelectorMock, showModalMock } from "./editorUiMocks";

export type Opened = { modal: string; into: Target["i"] | undefined } | { selector: string[] };

/** Gives every element under `root` an on-screen box (happy-dom has no layout). */
export function boxAll(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")])
    mockBoundingClientRect(element, { top: 0, left: 0, width: 100, height: 20 });
}

export async function altClickOpens(element: Element): Promise<Opened> {
  showModalMock.mockClear();
  showKeySelectorMock.mockClear();
  await flushDOMMutations();
  simulateMouseEvent(element, "click", { altKey: true });
  await vi.waitFor(() =>
    expect(showModalMock.mock.calls.length + showKeySelectorMock.mock.calls.length).toBe(1),
  );
  const modal = showModalMock.mock.calls[0];
  if (modal) return { modal: `${modal[1]}:${modal[0]}`, into: (modal[3] as Target | undefined)?.i };
  const keyData = showKeySelectorMock.mock.calls[0]![0] as Array<{ key: string; ns: string }>;
  return { selector: keyData.map((d) => `${d.ns}:${d.key}`) };
}
