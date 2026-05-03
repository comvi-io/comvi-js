/**
 * Shadow DOM utilities for isolating Vue components from host page styles
 */

import style from "../assets/index.css?inline";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../constants";

/**
 * Result of creating a shadow DOM container
 */
export interface ShadowDomContainer {
  /** The outer container element appended to document.body */
  container: HTMLElement;
  /** The shadow root for style isolation */
  shadowRoot: ShadowRoot;
  /** The mount point for Vue app inside shadow DOM */
  mountPoint: HTMLElement;
}

/**
 * Creates a shadow DOM container for Vue component isolation
 *
 * This utility:
 * 1. Creates a container div and appends to document.body
 * 2. Attaches a shadow root for style isolation
 * 3. Injects the plugin's CSS into the shadow DOM
 * 4. Creates a mount point for the Vue app
 *
 * @returns Container elements for mounting a Vue app
 *
 * @example
 * ```typescript
 * const { container, mountPoint } = createShadowDomContainer();
 * const app = createApp(MyComponent);
 * app.mount(mountPoint);
 *
 * // Cleanup
 * app.unmount();
 * container.remove();
 * ```
 */
export function createShadowDomContainer(): ShadowDomContainer {
  const container = document.createElement("div");
  container.setAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE, "true");
  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Add styles to the shadow DOM
  const styleElement = document.createElement("style");
  styleElement.textContent = style;
  shadowRoot.appendChild(styleElement);

  // Create a mount point for the app inside shadow DOM
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  return { container, shadowRoot, mountPoint };
}

/**
 * Removes a shadow DOM container from the document
 * @param container - The container element to remove
 */
export function removeShadowDomContainer(container: HTMLElement | null): void {
  if (container) {
    container.remove();
  }
}
