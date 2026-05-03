import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToastManager } from "../src/composables/useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with empty toasts", () => {
    const { toasts } = createToastManager();
    expect(toasts.value).toEqual([]);
  });

  it("should add a toast", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "Saved", variant: "success" });

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]!.title).toBe("Saved");
    expect(toasts.value[0]!.variant).toBe("success");
  });

  it("should add a toast with description", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "Error", description: "Something went wrong", variant: "error" });

    expect(toasts.value[0]!.description).toBe("Something went wrong");
  });

  it("should assign unique ids to toasts", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "First", variant: "success" });
    addToast({ title: "Second", variant: "error" });

    expect(toasts.value[0]!.id).not.toBe(toasts.value[1]!.id);
  });

  it("should auto-remove toast after 3 seconds", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "Temporary", variant: "success" });

    expect(toasts.value).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(toasts.value).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(toasts.value).toHaveLength(0);
  });

  it("should manually remove a toast", () => {
    const { toasts, addToast, removeToast } = createToastManager();
    addToast({ title: "First", variant: "success" });
    addToast({ title: "Second", variant: "error" });

    const idToRemove = toasts.value[0]!.id;
    removeToast(idToRemove);

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]!.title).toBe("Second");
  });

  it("should handle removing non-existent toast gracefully", () => {
    const { toasts, addToast, removeToast } = createToastManager();
    addToast({ title: "Only", variant: "success" });

    removeToast(99999);
    expect(toasts.value).toHaveLength(1);
  });

  it("should auto-remove multiple toasts independently", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "First", variant: "success" });

    vi.advanceTimersByTime(1000);
    addToast({ title: "Second", variant: "error" });

    expect(toasts.value).toHaveLength(2);

    // First toast removed at 3000ms
    vi.advanceTimersByTime(2000);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]!.title).toBe("Second");

    // Second toast removed at 4000ms
    vi.advanceTimersByTime(1000);
    expect(toasts.value).toHaveLength(0);
  });
});
