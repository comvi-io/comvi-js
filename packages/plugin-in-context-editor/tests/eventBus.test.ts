import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../src/eventBus";

describe("eventBus.ts - Pub/Sub System", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe("on - Event Subscription", () => {
    it("should subscribe to an event", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);
      eventBus.emit("test-event");

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to callback", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);
      eventBus.emit("test-event", "arg1", "arg2", 123);

      expect(callback).toHaveBeenCalledWith("arg1", "arg2", 123);
    });

    it("should support multiple callbacks for same event", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);
      eventBus.on("test-event", callback3);

      eventBus.emit("test-event");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it("should execute callbacks in subscription order", () => {
      const order: number[] = [];

      eventBus.on("test-event", () => order.push(1));
      eventBus.on("test-event", () => order.push(2));
      eventBus.on("test-event", () => order.push(3));

      eventBus.emit("test-event");

      expect(order).toEqual([1, 2, 3]);
    });

    it("should return unsubscribe function", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      expect(eventBus.listenerCount("test-event")).toBe(1);

      unsubscribe();
      expect(eventBus.listenerCount("test-event")).toBe(0);
      eventBus.emit("test-event");

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle multiple subscriptions to different events", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("event1", callback1);
      eventBus.on("event2", callback2);

      eventBus.emit("event1");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe("emit - Event Emission", () => {
    it("should emit event to all subscribers", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      eventBus.emit("test-event");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should do nothing if no subscribers", () => {
      expect(eventBus.listenerCount("non-existent-event")).toBe(0);
      expect(eventBus.emit("non-existent-event")).toBeUndefined();
    });

    it("should pass multiple arguments", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      const arg1 = { key: "value" };
      const arg2 = [1, 2, 3];
      const arg3 = "string";

      eventBus.emit("test-event", arg1, arg2, arg3);

      expect(callback).toHaveBeenCalledWith(arg1, arg2, arg3);
    });

    it("should handle no arguments", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      eventBus.emit("test-event");

      expect(callback).toHaveBeenCalledWith();
    });

    it("should handle complex data types", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      const complexData = {
        nodes: new Map([["key1", { value: 1 }]]),
        array: [1, 2, { nested: true }],
        func: () => {},
      };

      eventBus.emit("test-event", complexData);

      expect(callback).toHaveBeenCalledWith(complexData);
    });
  });

  describe("Unsubscribe", () => {
    it("should stop receiving events after unsubscribe", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      eventBus.emit("test-event");
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit("test-event");
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it("should only remove specific callback", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      unsubscribe1();
      eventBus.emit("test-event");

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple unsubscribes safely", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      unsubscribe();
      unsubscribe(); // Second call should be safe

      eventBus.emit("test-event");
      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle unsubscribe from non-existent event", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      // Remove listeners first to simulate external cleanup before unsubscribe callback runs.
      eventBus.removeAllListeners("test-event");
      unsubscribe();
      eventBus.emit("test-event");

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should catch errors in callbacks and continue", () => {
      const callback1 = vi.fn(() => {
        throw new Error("Callback 1 error");
      });
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      // Mock console.error to suppress error output
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      eventBus.emit("test-event");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1); // Should still be called
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("should log error with event name", () => {
      const callback = vi.fn(() => {
        throw new Error("Test error");
      });

      eventBus.on("error-event", callback);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      eventBus.emit("error-event");

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("error-event"),
        expect.any(Error),
      );

      consoleError.mockRestore();
    });

    it("should handle errors in multiple callbacks", () => {
      const callback1 = vi.fn(() => {
        throw new Error("Error 1");
      });
      const callback2 = vi.fn(() => {
        throw new Error("Error 2");
      });
      const callback3 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);
      eventBus.on("test-event", callback3);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      eventBus.emit("test-event");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledTimes(2);

      consoleError.mockRestore();
    });
  });

  describe("Event Isolation", () => {
    it("should keep events isolated", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      eventBus.on("event1", callback1);
      eventBus.on("event2", callback2);
      eventBus.on("event3", callback3);

      eventBus.emit("event2");

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).not.toHaveBeenCalled();
    });

    it("should handle similar event names separately", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test", callback1);
      eventBus.on("test-event", callback2);

      eventBus.emit("test");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe("Real-world DOMWatcher events", () => {
    it("should handle textChanges event", () => {
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      const textNodes = [document.createTextNode("test")];
      eventBus.emit("textChanges", textNodes);

      expect(callback).toHaveBeenCalledWith(textNodes);
    });

    it("should handle attributeChanges event", () => {
      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      const element = document.createElement("div");
      eventBus.emit("attributeChanges", [element]);

      expect(callback).toHaveBeenCalledWith([element]);
    });

    it("should handle structureChanges event", () => {
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      const nodes = [document.createElement("div"), document.createTextNode("text")];
      eventBus.emit("structureChanges", nodes);

      expect(callback).toHaveBeenCalledWith(nodes);
    });

    it("should handle nodesRemoved event", () => {
      const callback = vi.fn();
      eventBus.on("nodesRemoved", callback);

      const nodes = [document.createElement("div")];
      eventBus.emit("nodesRemoved", nodes);

      expect(callback).toHaveBeenCalledWith(nodes);
    });

    it("should handle initialScan event", () => {
      const callback = vi.fn();
      eventBus.on("initialScan", callback);

      const root = document.body;
      eventBus.emit("initialScan", root);

      expect(callback).toHaveBeenCalledWith(root);
    });
  });

  describe("Scale testing", () => {
    it("should handle many subscribers without errors", () => {
      const callbacks = Array.from({ length: 1000 }, () => vi.fn());

      // Subscribe all callbacks
      callbacks.forEach((callback) => {
        eventBus.on("test-event", callback);
      });

      expect(eventBus.listenerCount("test-event")).toBe(1000);
      eventBus.emit("test-event");

      // All callbacks should have been called
      callbacks.forEach((callback) => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
    });

    it("should handle rapid emissions", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      for (let i = 0; i < 1000; i++) {
        eventBus.emit("test-event", i);
      }

      expect(callback).toHaveBeenCalledTimes(1000);
    });
  });

  describe("Memory Management", () => {
    it("should not leak memory on unsubscribe", () => {
      const callbacks: Array<() => void> = [];
      const unsubscribers: Array<() => void> = [];

      for (let i = 0; i < 100; i++) {
        const callback = vi.fn();
        callbacks.push(callback);
        const unsubscribe = eventBus.on("test-event", callback);
        unsubscribers.push(unsubscribe);
      }

      // Unsubscribe all
      unsubscribers.forEach((unsub) => unsub());

      eventBus.emit("test-event");

      // None should be called
      callbacks.forEach((callback) => {
        expect(callback).not.toHaveBeenCalled();
      });
    });
  });
});
