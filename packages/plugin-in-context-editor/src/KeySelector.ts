/**
 * KeySelector - Translation key selection dropdown
 *
 * Shows a dropdown when an element has multiple translation keys,
 * allowing the user to select which key to edit.
 * Uses Shadow DOM for style isolation from the host page.
 */

import { createApp, ref, type App as VueApp } from "vue";
import KeySelectorApp from "./KeySelectorApp.vue";
import { createShadowDomContainer } from "./utils/shadowDom";

// Store app instance to prevent memory leaks
let container: HTMLElement | null = null;
let app: VueApp | null = null;

const isOpen = ref(false);

/**
 * Cleanup function to prevent memory leaks
 * Unmounts the Vue app and removes the container from DOM
 */
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

/**
 * Calculate position for the dropdown near the clicked element
 */
function calculatePosition(element: Element): { top: number; left: number } {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Estimated dropdown height
  const dropdownHeight = 300;
  const dropdownWidth = 400;

  let top = rect.bottom + window.scrollY + 8; // 8px gap below element
  let left = rect.left + window.scrollX;

  // Check if dropdown would overflow viewport bottom
  if (rect.bottom + dropdownHeight > viewportHeight) {
    // Position above element instead
    top = rect.top + window.scrollY - dropdownHeight - 8;
  }

  // Check if dropdown would overflow viewport right
  if (rect.left + dropdownWidth > viewportWidth) {
    left = viewportWidth - dropdownWidth - 16;
  }

  // Ensure not off-screen on left
  left = Math.max(16, left);

  // Ensure not off-screen on top
  top = Math.max(16, top);

  return { top, left };
}

function mountApp(
  keyData: Array<{ key: string; ns: string; textPreview?: string }>,
  element: Element,
  onSelect: (key: string, ns: string) => void,
  defaultNs?: string,
) {
  // Cleanup existing app before creating a new one
  cleanup();

  const { container: newContainer, mountPoint } = createShadowDomContainer();
  container = newContainer;

  isOpen.value = true;

  // Calculate position
  const position = calculatePosition(element);

  // Store app instance for cleanup later
  app = createApp(KeySelectorApp, {
    keyData,
    position,
    open: isOpen,
    defaultNs,
    "onUpdate:open": (value: boolean) => {
      isOpen.value = value;

      // Cleanup when closed
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

/**
 * Show the key selector dropdown
 * @param keysWithData - Array of key data objects with keys, namespaces and optional text previews
 * @param element - The element that was clicked (for positioning)
 * @param onSelect - Callback when a key is selected, receives key and namespace
 */
export function showKeySelector(
  keysWithData: Array<{ key: string; ns: string; textPreview?: string }>,
  element: Element,
  onSelect: (key: string, ns: string) => void,
  defaultNs?: string,
) {
  mountApp(keysWithData, element, onSelect, defaultNs);
}

/**
 * Close the key selector dropdown
 */
export function closeKeySelector() {
  cleanup();
}
