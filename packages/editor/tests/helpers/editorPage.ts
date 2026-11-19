/**
 * What a translator can observe on the page, for suites that run the REAL
 * runtime (Core + DOMWatcher + Scanner + Registry + Highlighter) in happy-dom.
 *
 * "The editor is running on this text" is read the way a translator reads it:
 * Alt+hover shows the key label. Nothing here reaches into the runtime.
 */

import { encodeKeyToInvisible, registerKey } from "../../src/translation";
import {
  flushDOMMutations,
  getActiveOverlay,
  getActiveTooltip,
  mockBoundingClientRect,
  simulateMouseEvent,
} from "../helpers";

/**
 * Appends `<p>` with `text` to `parent` (document.body by default) and gives it
 * an on-screen box. `text` may already carry markers (e.g. `i18n.t()` output).
 */
export function renderText(text: string, parent: Node = document.body): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  mockBoundingClientRect(paragraph, {
    top: 0,
    left: 0,
    width: 100,
    height: 20,
    right: 100,
    bottom: 20,
  });
  parent.appendChild(paragraph);
  return paragraph;
}

/**
 * Appends a `<p>` whose text carries the marker of `key` on the page-wide
 * encoder, the way an earlier `t()` call would have rendered it.
 */
export function renderMarked(
  key: string,
  options: { ns?: string; text?: string; parent?: Node } = {},
): HTMLParagraphElement {
  const marker = encodeKeyToInvisible(registerKey(key, options.ns));
  return renderText(`${options.text ?? key}${marker}`, options.parent);
}

/**
 * The Alt+hover tooltip a translator sees on `element`, or null when no
 * running editor owns it. Waits for pending DOM mutations first, so text
 * rendered just before the call has been scanned.
 */
export async function hoverLabel(element: Element): Promise<string | null> {
  await flushDOMMutations();
  return hoverLabelNow(element);
}

/**
 * `hoverLabel` without the flush: reads the label at this exact moment, for
 * probes that must run synchronously (inside a teardown callback, say).
 */
export function hoverLabelNow(element: Element): string | null {
  simulateMouseEvent(element, "mouseover", { altKey: true });
  const label = getActiveTooltip()?.textContent ?? null;
  simulateMouseEvent(element, "mouseout", { altKey: true });
  return label;
}

/**
 * Alt-click on `element` once pending DOM mutations are scanned. The editor UI
 * loads lazily after this returns, so a caller asserting that something opens
 * polls for it (`vi.waitFor`), and a caller asserting that nothing opens needs
 * a controlled import boundary (see `holdUiImports` in editorUiMocks.ts).
 */
export async function altClick(element: Element): Promise<void> {
  await flushDOMMutations();
  simulateMouseEvent(element, "click", { altKey: true });
}

/**
 * The Alt+hover overlay's border and fill on `element`, or null when no
 * running editor owns it. `zIndex` must match the configured highlight z-index.
 */
export async function hoverOverlayStyle(
  element: Element,
  zIndex?: number,
): Promise<{ border: string; backgroundColor: string } | null> {
  await flushDOMMutations();
  simulateMouseEvent(element, "mouseover", { altKey: true });
  const overlay = getActiveOverlay(zIndex);
  const style = overlay
    ? { border: overlay.style.border, backgroundColor: overlay.style.backgroundColor }
    : null;
  simulateMouseEvent(element, "mouseout", { altKey: true });
  return style;
}
