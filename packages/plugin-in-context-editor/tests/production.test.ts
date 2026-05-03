/**
 * Production Behavior Tests
 * Tests production-specific requirements and constraints
 */

import { describe, it, expect, vi } from "vitest";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { EventBus } from "../src/EventBus";

describe("production.test.ts - Production Environment Tests", () => {
  describe("Error handling", () => {
    it("should not throw on invalid operations", () => {
      const eventBus = new EventBus();
      const map = new TranslationRegistry(eventBus);

      const element = document.createElement("div");
      map.remove(element);

      expect(map.size()).toBe(0);
      expect(map.has(element)).toBe(false);
    });

    it("should handle null gracefully", () => {
      const eventBus = new EventBus();
      const map = new TranslationRegistry(eventBus);

      // Should throw with clear error message, not crash
      expect(() => {
        map.add(null as any, { nodes: new Map() });
      }).toThrow("Element cannot be null or undefined");
    });
  });

  describe("Bulk operations", () => {
    it("should handle adding many elements without errors", () => {
      const eventBus = new EventBus();
      const onRegistered = vi.fn();
      eventBus.on("translationRegistered", onRegistered);

      const map = new TranslationRegistry(eventBus);

      for (let i = 0; i < 100; i++) {
        const el = document.createElement("div");
        map.add(el, {
          nodes: new Map([[document.createTextNode("test"), { key: i }]]),
        });
      }

      // All elements should be added
      expect(map.size()).toBe(100);
      expect(onRegistered).toHaveBeenCalledTimes(100);
    });

    it("should cleanup all elements efficiently", () => {
      const eventBus = new EventBus();
      const map = new TranslationRegistry(eventBus);

      // Add many elements
      Array.from({ length: 100 }, () => {
        const el = document.createElement("div");
        map.add(el, {
          nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
        });
      });

      expect(map.size()).toBe(100);

      map.clear();
      expect(map.size()).toBe(0);
    });
  });

  describe("Memory safety", () => {
    it("should not retain references to removed elements", () => {
      const eventBus = new EventBus();
      const map = new TranslationRegistry(eventBus);

      const element = document.createElement("div");
      map.add(element, {
        nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
      });

      expect(map.has(element)).toBe(true);

      map.remove(element);

      // Should be fully removed, not retained
      expect(map.has(element)).toBe(false);
      expect(map.get(element)).toBeUndefined();
    });

    it("should emit events when elements are added and removed", () => {
      const eventBus = new EventBus();
      const onRegistered = vi.fn();
      const onRemoved = vi.fn();
      eventBus.on("translationRegistered", onRegistered);
      eventBus.on("translationRemoved", onRemoved);

      const map = new TranslationRegistry(eventBus);

      const element = document.createElement("div");
      map.add(element, {
        nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
      });

      expect(onRegistered).toHaveBeenCalledWith(element, expect.anything());

      map.remove(element);

      // Should emit translationRemoved event
      expect(onRemoved).toHaveBeenCalledWith(element);
    });
  });
});
