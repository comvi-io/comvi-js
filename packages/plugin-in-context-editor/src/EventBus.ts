import type { ElementData } from "./types/translation";

export interface EventBusEvents {
  // Emitted by DOMWatcher.
  textChanges: [nodes: Node[]];
  attributeChanges: [elements: Element[]];
  structureChanges: [nodes: Node[]];
  nodesRemoved: [nodes: Node[]];
  initialScan: [root: Node];

  // Emitted by TranslationRegistry; ElementHighlighter listens.
  translationRegistered: [element: Element, data: ElementData];
  translationRemoved: [element: Element];
  translationUpdated: [element: Element, data: ElementData];
}

type EventCallback<T extends unknown[]> = (...args: T) => void;

export class EventBus {
  private listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  /** Returns an unsubscribe function. */
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

  /** Without an event name, removes every listener for every event. */
  public removeAllListeners<K extends keyof EventBusEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  public listenerCount<K extends keyof EventBusEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
