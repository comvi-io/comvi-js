/**
 * The dropdown shown when one element carries several translation keys.
 * Mounted in a shadow root so host page styles cannot reach it.
 */

import { createApp, ref, type App as VueApp } from "vue";
import KeySelectorApp from "./KeySelectorApp.vue";
import { createShadowDomContainer } from "./utils/shadowDom";

let container: HTMLElement | null = null;
let app: VueApp | null = null;

const isOpen = ref(false);

export function cleanup() {
  if (app) {
    app.unmount();
    app = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  isOpen.value = false;
}

function calculatePosition(element: Element): { top: number; left: number } {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Estimate: the dropdown is not mounted yet, so it cannot be measured.
  const dropdownHeight = 300;
  const dropdownWidth = 400;

  let top = rect.bottom + window.scrollY + 8; // 8px gap below element
  let left = rect.left + window.scrollX;

  if (rect.bottom + dropdownHeight > viewportHeight) {
    top = rect.top + window.scrollY - dropdownHeight - 8;
  }

  if (rect.left + dropdownWidth > viewportWidth) {
    left = viewportWidth - dropdownWidth - 16;
  }

  left = Math.max(16, left);

  top = Math.max(16, top);

  return { top, left };
}

function mountApp(
  keyData: Array<{ key: string; ns: string; textPreview?: string }>,
  element: Element,
  onSelect: (key: string, ns: string) => void,
  defaultNs?: string,
) {
  cleanup();

  const { container: newContainer, mountPoint } = createShadowDomContainer();
  container = newContainer;

  isOpen.value = true;

  const position = calculatePosition(element);

  app = createApp(KeySelectorApp, {
    keyData,
    position,
    open: isOpen,
    defaultNs,
    "onUpdate:open": (value: boolean) => {
      isOpen.value = value;

      if (!value) {
        cleanup();
      }
    },
    onSelect: (selectedKey: string, selectedNs: string) => {
      onSelect(selectedKey, selectedNs);
      cleanup();
    },
  });
  app.mount(mountPoint);
}

/** @param element - The clicked element; the dropdown is positioned against it. */
export function showKeySelector(
  keysWithData: Array<{ key: string; ns: string; textPreview?: string }>,
  element: Element,
  onSelect: (key: string, ns: string) => void,
  defaultNs?: string,
) {
  mountApp(keysWithData, element, onSelect, defaultNs);
}

export function closeKeySelector() {
  cleanup();
}
