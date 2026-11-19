/**
 * The highlight overlay shown when hovering a translated element with the
 * Alt/Option key held.
 */

import {
  DEFAULT_HIGHLIGHT_Z_INDEX,
  DEFAULT_HIGHLIGHT_BORDER_WIDTH,
  DEFAULT_HIGHLIGHT_BORDER_COLOR,
  DEFAULT_HIGHLIGHT_BACKGROUND_COLOR,
} from "./config/highlight";
import { EDITOR_UI_ATTRIBUTE } from "./constants";
import type { EventBus } from "./EventBus";
import type { ElementData } from "./types/translation";

const MODIFIER_KEYS = {
  ALT: "Alt",
  OPTION: "Option",
} as const;

interface HighlightStyle {
  borderColor: string;
  backgroundColor: string;
  borderWidth: number;
  zIndex: number;
}

interface ElementHighlighterOptions {
  debug?: boolean;
  highlightStyle?: Partial<HighlightStyle>;
  defaultNs?: string;
}

const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  borderColor: DEFAULT_HIGHLIGHT_BORDER_COLOR,
  backgroundColor: DEFAULT_HIGHLIGHT_BACKGROUND_COLOR,
  borderWidth: DEFAULT_HIGHLIGHT_BORDER_WIDTH,
  zIndex: DEFAULT_HIGHLIGHT_Z_INDEX,
};

export class ElementHighlighter {
  private activeHighlight: HTMLDivElement | null = null;
  private activeTooltip: HTMLDivElement | null = null;
  private activeElement: Element | null = null;
  private debug: boolean;
  private defaultNs?: string;
  private isAltKeyPressed: boolean = false;
  private hoveredElement: Element | null = null;
  private highlightedElements: Set<Element> = new Set();
  private readonly highlightStyle: HighlightStyle;

  private elementKeyMap: Map<Element, string[]> = new Map();

  /** The frame of the per-frame position tracking, while the overlay is shown. */
  private trackingFrame: number | null = null;

  private unsubscribers: (() => void)[] = [];

  constructor(
    private eventBus: EventBus,
    private handleElementClick: (element: Element) => void,
    options: ElementHighlighterOptions = {},
  ) {
    this.debug = options.debug ?? false;
    this.defaultNs = options.defaultNs;
    this.highlightStyle = {
      ...DEFAULT_HIGHLIGHT_STYLE,
      ...options.highlightStyle,
    };

    this.handleKeyEvent = this.handleKeyEvent.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);

    this.subscribeToEvents();

    document.addEventListener("keydown", this.handleKeyEvent, {
      passive: true,
    });
    document.addEventListener("keyup", this.handleKeyEvent, { passive: true });
    document.addEventListener("mouseover", this.handleMouseOver, {
      capture: true,
    });
    document.addEventListener("mouseout", this.handleMouseOut, {
      capture: true,
    });
    document.addEventListener("click", this.handleClick, { capture: true });
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on("translationRegistered", (element, data: ElementData) => {
        this.addHighlight(element);
        this.updateElementKeys(element, data);
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("translationUpdated", (element, data: ElementData) => {
        this.updateElementKeys(element, data);
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("translationRemoved", (element) => {
        this.removeHighlightFromElement(element);
        this.elementKeyMap.delete(element);
      }),
    );
  }

  private updateElementKeys(element: Element, data: ElementData): void {
    const keys: string[] = [];
    for (const nodeData of data.nodes.values()) {
      for (const { key, ns } of nodeData.markers ?? [nodeData]) {
        const label = this.formatKeyLabel(key, ns);
        if (!keys.includes(label)) {
          keys.push(label);
        }
      }
    }
    this.elementKeyMap.set(element, keys);
  }

  private formatKeyLabel(key: string, ns?: string): string {
    if (!ns || ns === this.defaultNs) {
      return key;
    }
    return `${key} (${ns})`;
  }

  private handleKeyEvent = (event: KeyboardEvent): void => {
    if (event.key === MODIFIER_KEYS.ALT || event.key === MODIFIER_KEYS.OPTION) {
      this.isAltKeyPressed = event.type === "keydown";
      if (this.isAltKeyPressed && this.hoveredElement) {
        this.ensureOverlayExists(this.hoveredElement);
      } else if (!this.isAltKeyPressed) {
        this.removeHighlightOverlay();
      }
    }
  };

  private isModifierPressed(event?: Event): boolean {
    if (event instanceof MouseEvent) {
      return event.altKey || this.isAltKeyPressed;
    }
    return this.isAltKeyPressed;
  }

  private handleWindowBlur(): void {
    this.isAltKeyPressed = false;
    this.hoveredElement = null;
    this.removeHighlightOverlay();
  }

  private getParentElementAcrossShadow(element: Element): Element | null {
    if (element.parentElement) {
      return element.parentElement;
    }

    const rootNode = element.getRootNode();
    if (typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot) {
      return rootNode.host;
    }

    return null;
  }

  private findRegisteredElementFromEvent(event: Event): Element | null {
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      for (const node of path) {
        if (!(node instanceof Element)) {
          continue;
        }
        const registered = this.findRegisteredAncestor(node);
        if (registered) {
          return registered;
        }
      }
    }

    return event.target instanceof Element ? this.findRegisteredAncestor(event.target) : null;
  }

  private findRegisteredElementFromNode(node: EventTarget | null): Element | null {
    if (!(node instanceof Element)) {
      return null;
    }
    return this.findRegisteredAncestor(node);
  }

  private findRegisteredAncestor(element: Element | null): Element | null {
    if (!element) {
      return null;
    }

    // Walked on every event, not cached: a cached result goes stale when the
    // page moves a node without changing any registration.
    let current: Element | null = element;
    while (current) {
      if (this.highlightedElements.has(current)) {
        return current;
      }
      current = this.getParentElementAcrossShadow(current);
    }

    return null;
  }

  private handleMouseOver = (event: Event): void => {
    const registeredElement = this.findRegisteredElementFromEvent(event);
    if (!registeredElement) {
      return;
    }

    this.hoveredElement = registeredElement;
    if (this.isModifierPressed(event)) {
      this.ensureOverlayExists(registeredElement);
    }
  };

  private handleMouseOut = (event: Event): void => {
    const registeredTarget = this.findRegisteredElementFromEvent(event);
    if (!registeredTarget) {
      return;
    }

    const relatedTarget = (event as MouseEvent).relatedTarget;
    const registeredRelated = this.findRegisteredElementFromNode(relatedTarget);
    if (!registeredRelated || registeredRelated !== registeredTarget) {
      this.hoveredElement = null;
      if (this.isModifierPressed(event)) {
        this.removeHighlightOverlay();
      }
    }
  };

  private handleClick = (event: Event): void => {
    const registeredElement = this.findRegisteredElementFromEvent(event);
    if (!registeredElement || !this.isModifierPressed(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();

    this.handleElementClick(registeredElement);
  };

  private createHighlightOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.setAttribute(EDITOR_UI_ATTRIBUTE, "");
    overlay.style.position = "absolute";
    overlay.style.border = `${this.highlightStyle.borderWidth}px solid ${this.highlightStyle.borderColor}`;
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = this.highlightStyle.zIndex.toString();
    overlay.style.backgroundColor = this.highlightStyle.backgroundColor;
    overlay.style.borderRadius = "0px";
    overlay.style.cursor = "pointer";
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 150ms ease-in-out";
    return overlay;
  }

  private createTooltip(element: Element): HTMLDivElement | null {
    const keys = this.elementKeyMap.get(element);
    if (!keys || keys.length === 0) return null;

    const tooltip = document.createElement("div");
    tooltip.setAttribute(EDITOR_UI_ATTRIBUTE, "");
    tooltip.textContent = keys.length === 1 ? keys[0] : `${keys[0]} (+${keys.length - 1})`;
    tooltip.style.position = "absolute";
    tooltip.style.backgroundColor = "#0E0D0C";
    tooltip.style.color = "#F4EFE0";
    tooltip.style.border = "1px solid #2A2725";
    tooltip.style.fontFamily = "ui-monospace, SFMono-Regular, monospace";
    tooltip.style.fontSize = "11px";
    tooltip.style.letterSpacing = "0.05em";
    tooltip.style.padding = "4px 8px";
    tooltip.style.borderRadius = "0px";
    tooltip.style.pointerEvents = "none";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.zIndex = (this.highlightStyle.zIndex + 1).toString();
    tooltip.style.opacity = "0";
    tooltip.style.transition = "opacity 150ms ease-in-out";
    return tooltip;
  }

  private updateTooltipPosition(tooltip: HTMLDivElement, element: Element): void {
    const rect = element.getBoundingClientRect();
    const tooltipHeight = 28; // approximate height
    const gap = 6;

    // Prefer above, fall back to below
    const spaceAbove = rect.top;
    if (spaceAbove >= tooltipHeight + gap) {
      tooltip.style.top = `${rect.top + window.scrollY - tooltipHeight - gap}px`;
    } else {
      tooltip.style.top = `${rect.bottom + window.scrollY + gap}px`;
    }
    tooltip.style.left = `${rect.left + window.scrollX}px`;
  }

  private updateHighlightPosition(overlay: HTMLDivElement, element: Element): void {
    if (!element.isConnected) {
      if (this.debug) {
        console.warn(
          "[@comvi/plugin-in-context-editor] Cannot update position: element is detached from DOM",
        );
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    if (this.activeTooltip) {
      this.updateTooltipPosition(this.activeTooltip, element);
    }
  }

  /**
   * Follows the active element once per animation frame while the overlay is
   * shown: scrolling, resizing and layout shifts all move it, and only a
   * per-frame read catches all three. The page is measured once per frame and
   * written only when the rectangle changed.
   */
  private startPositionTracking(): void {
    if (this.trackingFrame !== null) {
      return;
    }
    let lastGeometry = "";
    const track = () => {
      this.trackingFrame = null;
      const overlay = this.activeHighlight;
      const element = this.activeElement;
      if (!overlay || !element) {
        return;
      }
      if (!element.isConnected) {
        this.updateHighlightPosition(overlay, element);
        return;
      }
      const rect = element.getBoundingClientRect();
      const geometry = `${rect.top},${rect.left},${rect.width},${rect.height},${window.scrollX},${window.scrollY}`;
      if (geometry !== lastGeometry) {
        lastGeometry = geometry;
        this.updateHighlightPosition(overlay, element);
      }
      this.trackingFrame = requestAnimationFrame(track);
    };
    this.trackingFrame = requestAnimationFrame(track);
  }

  private stopPositionTracking(): void {
    if (this.trackingFrame !== null) {
      cancelAnimationFrame(this.trackingFrame);
      this.trackingFrame = null;
    }
  }

  private ensureOverlayExists(element: Element): void {
    if (!this.activeHighlight) {
      const overlay = this.createHighlightOverlay();
      this.updateHighlightPosition(overlay, element);
      document.body.appendChild(overlay);
      this.activeHighlight = overlay;
      this.activeElement = element;

      const tooltip = this.createTooltip(element);
      if (tooltip) {
        this.updateTooltipPosition(tooltip, element);
        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;
      }

      requestAnimationFrame(() => {
        if (this.activeHighlight) this.activeHighlight.style.opacity = "1";
        if (this.activeTooltip) this.activeTooltip.style.opacity = "1";
      });

      this.startPositionTracking();
    } else {
      this.activeElement = element;
      this.updateHighlightPosition(this.activeHighlight, element);

      this.removeTooltip();
      const tooltip = this.createTooltip(element);
      if (tooltip) {
        this.updateTooltipPosition(tooltip, element);
        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;
        requestAnimationFrame(() => {
          if (this.activeTooltip) this.activeTooltip.style.opacity = "1";
        });
      }
    }
  }

  /** @throws {Error} If the element is null or undefined. */
  public addHighlight(element: Element): void {
    if (!element) {
      throw new Error("[@comvi/plugin-in-context-editor] Element cannot be null or undefined");
    }

    this.highlightedElements.add(element);
  }

  public removeHighlightFromElement(element: Element): void {
    this.highlightedElements.delete(element);

    if (this.activeElement === element) {
      this.removeHighlightOverlay();
    }
  }

  private removeTooltip(): void {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  private removeHighlightOverlay(): void {
    if (this.activeHighlight) {
      this.activeHighlight.remove();
      this.activeHighlight = null;
      this.activeElement = null;
      this.removeTooltip();
      this.stopPositionTracking();
    }
  }

  public cleanup(): void {
    this.removeHighlightOverlay();
    this.highlightedElements.clear();
    this.elementKeyMap.clear();

    this.stopPositionTracking();

    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    document.removeEventListener("keydown", this.handleKeyEvent);
    document.removeEventListener("keyup", this.handleKeyEvent);
    document.removeEventListener("mouseover", this.handleMouseOver, {
      capture: true,
    });
    document.removeEventListener("mouseout", this.handleMouseOut, {
      capture: true,
    });
    document.removeEventListener("click", this.handleClick, { capture: true });
    window.removeEventListener("blur", this.handleWindowBlur);
  }
}
