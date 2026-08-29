/**
 * Shadow DOM utilities for isolating Vue components from host page styles
 */

import style from "../assets/index.css?inline";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../constants";

export interface ShadowDomContainer {
  /** The outer container element appended to document.body */
  container: HTMLElement;
  /** The shadow root for style isolation */
  shadowRoot: ShadowRoot;
  /** The mount point for Vue app inside shadow DOM */
  mountPoint: HTMLElement;
}

/**
 * The plugin's own CSS is injected INTO the shadow root, so host page styles
 * cannot reach the editor UI and the editor's cannot leak out.
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

  const styleElement = document.createElement("style");
  styleElement.textContent = style;
  shadowRoot.appendChild(styleElement);

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  return { container, shadowRoot, mountPoint };
}

export function removeShadowDomContainer(container: HTMLElement | null): void {
  if (container) {
    container.remove();
  }
}
