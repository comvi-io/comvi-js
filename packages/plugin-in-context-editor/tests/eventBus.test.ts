import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../src/EventBus";

// Most of this suite exercises the bus's generic dispatch machinery rather than
// any production event, so it drives it with synthetic names. The bus is keyed
// by EventBusEvents, so those names have to be declared on that map for the
// tests to type-check; the augmentation is confined to this file's program.
declare module "../src/EventBus" {
  interface EventBusEvents {
    "test-event": unknown[];
    "non-existent-event": unknown[];
    "error-event": unknown[];
    test: unknown[];
  }
}

describe("EventBus", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe("on()", () => {
    it("should subscribe to an event", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);
      eventBus.emit("test-event");

      expect(callback).toHaveBeenCalledTimes(1);
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

    it("should not deliver the in-flight event to a listener subscribed during emit", () => {
      const lateCallback = vi.fn();
      eventBus.on("test-event", () => {
        eventBus.on("test-event", lateCallback);
      });

      eventBus.emit("test-event");

      expect(lateCallback).not.toHaveBeenCalled();
      expect(eventBus.listenerCount("test-event")).toBe(2);

      eventBus.emit("test-event");
      expect(lateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("emit()", () => {
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
      expect(() => eventBus.emit("non-existent-event")).not.toThrow();
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
      };

      eventBus.emit("test-event", complexData);

      expect(callback).toHaveBeenCalledWith(complexData);
    });

    it.each([
      "textChanges",
      "attributeChanges",
      "structureChanges",
      "nodesRemoved",
      "initialScan",
    ] as const)("should deliver the %s payload to its subscriber unchanged", (eventName) => {
      const callback = vi.fn();
      const payload = [document.createElement("div"), document.createTextNode("text")];
      eventBus.on(eventName, callback);

      eventBus.emit(eventName, payload);

      expect(callback).toHaveBeenCalledExactlyOnceWith(payload);
    });
  });

  describe("unsubscribe", () => {
    it("should stop receiving events after unsubscribe", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      eventBus.emit("test-event");
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit("test-event");
      expect(callback).toHaveBeenCalledTimes(1);
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
      unsubscribe();

      eventBus.emit("test-event");
      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle unsubscribe from non-existent event", () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.on("test-event", callback);

      // Simulates external cleanup landing before the unsubscribe callback runs.
      eventBus.removeAllListeners("test-event");
      unsubscribe();
      eventBus.emit("test-event");

      expect(callback).not.toHaveBeenCalled();
    });

    it("should stop all delivery once every listener has unsubscribed", () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];
      const unsubscribers = callbacks.map((callback) => eventBus.on("test-event", callback));

      unsubscribers.forEach((unsubscribe) => unsubscribe());
      eventBus.emit("test-event");

      expect(eventBus.listenerCount("test-event")).toBe(0);
      expect(callbacks.map((callback) => callback.mock.calls.length)).toEqual([0, 0, 0]);
    });
  });

  describe("removeListener()", () => {
    it("leaves the registered listeners in place when the callback was never added", () => {
      const registered = vi.fn();
      const other = vi.fn();
      eventBus.on("textChanges", registered);
      eventBus.on("textChanges", other);

      eventBus.removeListener("textChanges", vi.fn());
      eventBus.emit("textChanges", []);

      expect(eventBus.listenerCount("textChanges")).toBe(2);
      expect([registered.mock.calls.length, other.mock.calls.length]).toEqual([1, 1]);
    });

    it("removes only the given callback when it sits between other listeners", () => {
      const first = vi.fn();
      const middle = vi.fn();
      const last = vi.fn();
      eventBus.on("textChanges", first);
      eventBus.on("textChanges", middle);
      eventBus.on("textChanges", last);

      eventBus.removeListener("textChanges", middle);
      eventBus.emit("textChanges", []);

      expect([first.mock.calls.length, middle.mock.calls.length, last.mock.calls.length]).toEqual([
        1, 0, 1,
      ]);
    });
  });

  describe("removeAllListeners()", () => {
    it("drops every listener of the named event and leaves other events subscribed", () => {
      const firstOnText = vi.fn();
      const secondOnText = vi.fn();
      const onAttributes = vi.fn();
      eventBus.on("textChanges", firstOnText);
      eventBus.on("textChanges", secondOnText);
      eventBus.on("attributeChanges", onAttributes);

      eventBus.removeAllListeners("textChanges");
      eventBus.emit("textChanges", []);
      eventBus.emit("attributeChanges", []);

      expect(eventBus.listenerCount("textChanges")).toBe(0);
      expect([firstOnText.mock.calls.length, secondOnText.mock.calls.length]).toEqual([0, 0]);
      expect(onAttributes).toHaveBeenCalledTimes(1);
    });

    it("drops the listeners of every event when called without an event name", () => {
      const onText = vi.fn();
      const onAttributes = vi.fn();
      eventBus.on("textChanges", onText);
      eventBus.on("attributeChanges", onAttributes);

      eventBus.removeAllListeners();
      eventBus.emit("textChanges", []);
      eventBus.emit("attributeChanges", []);

      expect([
        eventBus.listenerCount("textChanges"),
        eventBus.listenerCount("attributeChanges"),
      ]).toEqual([0, 0]);
      expect([onText.mock.calls.length, onAttributes.mock.calls.length]).toEqual([0, 0]);
    });
  });

  describe("error handling", () => {
    it("should catch errors in callbacks and continue", () => {
      const callback1 = vi.fn(() => {
        throw new Error("Callback 1 error");
      });
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      eventBus.emit("test-event");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
    });

    it("should log error with event name", () => {
      const callback = vi.fn(() => {
        throw new Error("Test error");
      });

      eventBus.on("error-event", callback);

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      eventBus.emit("error-event");

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        'Error in event listener for "error-event":',
        expect.any(Error),
      );
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
    });
  });

  describe("event isolation", () => {
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

  describe("scale", () => {
    it("should deliver one call per subscriber to every subscriber", () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];
      callbacks.forEach((callback) => eventBus.on("test-event", callback));

      expect(eventBus.listenerCount("test-event")).toBe(3);
      eventBus.emit("test-event");

      expect(callbacks.map((callback) => callback.mock.calls.length)).toEqual([1, 1, 1]);
    });

    it("should count one callback invocation per emission", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      for (let i = 0; i < 3; i++) {
        eventBus.emit("test-event", i);
      }

      expect(callback.mock.calls).toEqual([[0], [1], [2]]);
    });
  });
});
