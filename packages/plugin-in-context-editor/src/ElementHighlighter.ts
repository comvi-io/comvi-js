/**
 * ElementHighlighter - Provides visual highlighting for translated elements
 *
 * This class manages the highlight overlay when hovering over translated
 * elements with the Alt/Option key pressed. Refactored to:
 * - Use EventBus for decoupling from TranslationRegistry
 * - Cache findRegisteredAncestor results for performance
 * - Use shared debounce utility
 */

import {
  SCROLL_DEBOUNCE_DELAY,
  DEFAULT_HIGHLIGHT_Z_INDEX,
  DEFAULT_HIGHLIGHT_BORDER_WIDTH,
  DEFAULT_HIGHLIGHT_BORDER_COLOR,
  DEFAULT_HIGHLIGHT_BACKGROUND_COLOR,
} from "./config/highlight";
import type { EventBus } from "./EventBus";
import type { ElementData } from "./types/translation";
import { debounce, type DebouncedFunction } from "./utils/debounce";

// Modifier key constants
const MODIFIER_KEYS = {
  ALT: "Alt",
  OPTION: "Option",
} as const;

/**
 * Interface for highlight style configuration
 */
interface HighlightStyle {
  borderColor: string;
  backgroundColor: string;
  borderWidth: number;
  zIndex: number;
}

/**
 * Options for ElementHighlighter
 */
interface ElementHighlighterOptions {
  debug?: boolean;
  highlightStyle?: Partial<HighlightStyle>;
  defaultNs?: string;
}

/**
 * Default highlight style configuration
 */
const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  borderColor: DEFAULT_HIGHLIGHT_BORDER_COLOR,
  backgroundColor: DEFAULT_HIGHLIGHT_BACKGROUND_COLOR,
  borderWidth: DEFAULT_HIGHLIGHT_BORDER_WIDTH,
  zIndex: DEFAULT_HIGHLIGHT_Z_INDEX,
};

/**
 * Class responsible for highlighting elements when hovering with Alt/Option key pressed
 * Now uses EventBus for decoupled communication with TranslationRegistry
 */
export class ElementHighlighter {
  private activeHighlight: HTMLDivElement | null = null;
  private activeTooltip: HTMLDivElement | null = null;
  private activeElement: Element | null = null;
  private debug: boolean;
  private defaultNs?: string;
  private isAltKeyPressed: boolean = false;
  private hoveredElement: Element | null = null;
  private highlightedElements: Set<Element> = new Set();
  private scrollableContainers: Set<Element> = new Set();
  private readonly highlightStyle: HighlightStyle;

  // Map from element to translation keys for tooltip display
  private elementKeyMap: Map<Element, string[]> = new Map();

  // Cache for findRegisteredAncestor results
  private ancestorCache: WeakMap<Element, Element | null> = new WeakMap();

  // Debounced scroll handler
  private debouncedScrollHandler: DebouncedFunction<() => void>;

  // Event unsubscribers for cleanup
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

    // Create debounced scroll handler
    this.debouncedScrollHandler = debounce(() => {
      if (this.activeHighlight && this.activeElement) {
        this.updateHighlightPosition(this.activeHighlight, this.activeElement);
      }
    }, SCROLL_DEBOUNCE_DELAY);

    // Bind event handlers
    this.handleKeyEvent = this.handleKeyEvent.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);

    // Subscribe to EventBus events
    this.subscribeToEvents();

    // Add DOM event listeners
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

  /**
   * Subscribe to EventBus events for translation changes
   */
  private subscribeToEvents(): void {
    // When a translation is registered, add highlight and track keys
    this.unsubscribers.push(
      this.eventBus.on("translationRegistered", (element, data: ElementData) => {
        this.addHighlight(element);
        this.updateElementKeys(element, data);
      }),
    );

    // When a translation is updated, refresh keys
    this.unsubscribers.push(
      this.eventBus.on("translationUpdated", (element, data: ElementData) => {
        this.updateElementKeys(element, data);
      }),
    );

    // When a translation is removed, remove highlight and keys
    this.unsubscribers.push(
      this.eventBus.on("translationRemoved", (element) => {
        this.removeHighlightFromElement(element);
        this.elementKeyMap.delete(element);
      }),
    );
  }

  /**
   * Updates the key map for an element from its translation data
   */
  private updateElementKeys(element: Element, data: ElementData): void {
    const keys: string[] = [];
    for (const nodeData of data.nodes.values()) {
      const label = this.formatKeyLabel(nodeData.key, nodeData.ns);
      if (!keys.includes(label)) {
        keys.push(label);
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

  /**
   * Finds the nearest ancestor element that is registered for highlighting.
   * Uses caching for improved performance.
   */
  private findRegisteredAncestor(element: Element | null): Element | null {
    if (!element) {
      return null;
    }

    // Check cache first
    const cached = this.ancestorCache.get(element);
    if (cached !== undefined) {
      return cached;
    }

    // Walk up the tree to find registered ancestor
    let current: Element | null = element;
    while (current) {
      if (this.highlightedElements.has(current)) {
        // Cache the result
        this.ancestorCache.set(element, current);
        return current;
      }
      current = this.getParentElementAcrossShadow(current);
    }

    // Cache null result
    this.ancestorCache.set(element, null);
    return null;
  }

  /**
   * Invalidates cache for an element and its descendants
   */
  private invalidateAncestorCache(): void {
    // WeakMap doesn't have clear(), but we can create a new one
    // This is safe since WeakMap entries are garbage collected
    this.ancestorCache = new WeakMap();
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

  /**
   * Creates a tooltip element showing the translation key
   */
  private createTooltip(element: Element): HTMLDivElement | null {
    const keys = this.elementKeyMap.get(element);
    if (!keys || keys.length === 0) return null;

    const tooltip = document.createElement("div");
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

  /**
   * Positions the tooltip above or below the element
   */
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
    // Check if element is still connected to the DOM
    if (!element.isConnected) {
      if (this.debug) {
        console.warn("[ElementHighlighter] Cannot update position: element is detached from DOM");
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

  private handleScroll = (): void => {
    this.debouncedScrollHandler();
  };

  /**
   * Finds all scrollable ancestor containers of an element
   */
  private findScrollableAncestors(element: Element): Element[] {
    const scrollableAncestors: Element[] = [];
    let current = this.getParentElementAcrossShadow(element);

    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      if (
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowX === "auto" ||
        overflowX === "scroll"
      ) {
        scrollableAncestors.push(current);
      }

      current = this.getParentElementAcrossShadow(current);
    }

    return scrollableAncestors;
  }

  /**
   * Removes scroll listeners from all tracked scrollable containers
   */
  private cleanupScrollListeners(): void {
    this.scrollableContainers.forEach((container) => {
      container.removeEventListener("scroll", this.handleScroll);
    });
    this.scrollableContainers.clear();
  }

  private ensureOverlayExists(element: Element): void {
    if (!this.activeHighlight) {
      const overlay = this.createHighlightOverlay();
      this.updateHighlightPosition(overlay, element);
      document.body.appendChild(overlay);
      this.activeHighlight = overlay;
      this.activeElement = element;

      // Create and append tooltip
      const tooltip = this.createTooltip(element);
      if (tooltip) {
        this.updateTooltipPosition(tooltip, element);
        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;
      }

      // Trigger fade-in animation
      requestAnimationFrame(() => {
        if (this.activeHighlight) this.activeHighlight.style.opacity = "1";
        if (this.activeTooltip) this.activeTooltip.style.opacity = "1";
      });

      // Add scroll listener to window
      window.addEventListener("scroll", this.handleScroll, { passive: true });

      // Add scroll listeners to all scrollable ancestor containers
      const scrollableAncestors = this.findScrollableAncestors(element);
      scrollableAncestors.forEach((container) => {
        container.addEventListener("scroll", this.handleScroll, {
          passive: true,
        });
        this.scrollableContainers.add(container);
      });
    } else {
      // When switching elements, cleanup old listeners and add new ones
      this.cleanupScrollListeners();
      this.activeElement = element;
      this.updateHighlightPosition(this.activeHighlight, element);

      // Update tooltip for new element
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

      // Add scroll listeners for new element
      const scrollableAncestors = this.findScrollableAncestors(element);
      scrollableAncestors.forEach((container) => {
        container.addEventListener("scroll", this.handleScroll, {
          passive: true,
        });
        this.scrollableContainers.add(container);
      });
    }
  }

  /**
   * Adds highlight functionality to an element
   * @param element - The element to add highlighting to
   * @throws {Error} If the element is null or undefined
   */
  public addHighlight(element: Element): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    this.highlightedElements.add(element);
    // Invalidate cache since registered elements changed
    this.invalidateAncestorCache();
  }

  /**
   * Removes highlight functionality from a specific element
   * @param element - The element to remove highlighting from
   */
  public removeHighlightFromElement(element: Element): void {
    this.highlightedElements.delete(element);
    // Invalidate cache since registered elements changed
    this.invalidateAncestorCache();

    // If this was the actively highlighted element, remove overlay
    if (this.activeElement === element) {
      this.removeHighlightOverlay();
    }
  }

  /**
   * Removes the active highlight overlay
   */
  /**
   * Removes the tooltip element from the DOM
   */
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
      window.removeEventListener("scroll", this.handleScroll);
      this.cleanupScrollListeners();
    }
  }

  /**
   * Cleans up all highlights and event listeners
   */
  public cleanup(): void {
    this.removeHighlightOverlay();
    this.highlightedElements.clear();
    this.elementKeyMap.clear();

    // Cancel debounced handler
    this.debouncedScrollHandler.cancel();

    // Unsubscribe from EventBus
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    // Remove DOM event listeners
    document.removeEventListener("keydown", this.handleKeyEvent);
    document.removeEventListener("keyup", this.handleKeyEvent);
    document.removeEventListener("mouseover", this.handleMouseOver, {
      capture: true,
    });
    document.removeEventListener("mouseout", this.handleMouseOut, {
      capture: true,
    });
    document.removeEventListener("click", this.handleClick, { capture: true });
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("blur", this.handleWindowBlur);

    // Ensure all scrollable container listeners are removed
    this.cleanupScrollListeners();
  }
}
