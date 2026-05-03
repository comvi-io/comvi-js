/**
 * Event bus for in-context editor
 * Provides type-safe pub/sub functionality for component communication
 */

import type { ElementData } from "./types/translation";

/**
 * Event bus event type definitions
 * Add new events here to enable type-safe subscriptions
 */
export interface EventBusEvents {
  // DOM mutation events (from DOMWatcher)
  textChanges: [nodes: Node[]];
  attributeChanges: [elements: Element[]];
  structureChanges: [nodes: Node[]];
  nodesRemoved: [nodes: Node[]];
  initialScan: [root: Node];

  // Translation registry events (for decoupling ElementHighlighter)
  translationRegistered: [element: Element, data: ElementData];
  translationRemoved: [element: Element];
  translationUpdated: [element: Element, data: ElementData];
}

/**
 * Type-safe event callback
 */
type EventCallback<T extends unknown[]> = (...args: T) => void;

/**
 * Type-safe event bus for in-context editor
 * Provides pub/sub functionality with TypeScript type checking
 */
export class EventBus {
  private listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  /**
   * Subscribe to an event with type-safe callback
   * @param event - Event name
   * @param callback - Event handler
   * @returns Unsubscribe function
   */
  public on<K extends keyof EventBusEvents>(
    event: K,
    callback: EventCallback<EventBusEvents[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback as (...args: unknown[]) => void);

    return () => {
      this.removeListener(event, callback);
    };
  }

  /**
   * Emit an event with type-safe arguments
   * @param event - Event name
   * @param args - Event arguments
   */
  public emit<K extends keyof EventBusEvents>(event: K, ...args: EventBusEvents[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Remove a specific listener for an event
   * @param event - Event name
   * @param callback - The callback to remove
   */
  public removeListener<K extends keyof EventBusEvents>(
    event: K,
    callback: EventCallback<EventBusEvents[K]>,
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback as (...args: unknown[]) => void);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all listeners for a specific event
   * @param event - Event name (optional, if not provided removes all listeners for all events)
   */
  public removeAllListeners<K extends keyof EventBusEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for a specific event
   * Useful for debugging and testing
   * @param event - Event name
   * @returns Number of listeners
   */
  public listenerCount<K extends keyof EventBusEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
