import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToastManager } from "../src/composables/useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a new manager has no toasts", () => {
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
    const first = createToastManager();
    const second = createToastManager();
    first.addToast({ title: "First", variant: "success" });
    first.addToast({ title: "Second", variant: "error" });
    second.addToast({ title: "Third", variant: "success" });

    const ids = [...first.toasts.value.map((t) => t.id), second.toasts.value[0]!.id];

    // The id counter is module-level, so it must stay unique across managers too.
    expect(new Set(ids).size).toBe(3);
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

  it("should leave the list intact when the auto-remove timer fires after a manual removal", () => {
    const { toasts, addToast, removeToast } = createToastManager();
    addToast({ title: "Removed early", variant: "success" });
    addToast({ title: "Kept", variant: "error" });

    removeToast(toasts.value[0]!.id);
    vi.advanceTimersByTime(3000);

    expect(toasts.value).toEqual([]);
  });

  it("should auto-remove multiple toasts independently", () => {
    const { toasts, addToast } = createToastManager();
    addToast({ title: "First", variant: "success" });

    vi.advanceTimersByTime(1000);
    addToast({ title: "Second", variant: "error" });

    expect(toasts.value).toHaveLength(2);

    vi.advanceTimersByTime(2000);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]!.title).toBe("Second");

    vi.advanceTimersByTime(1000);
    expect(toasts.value).toHaveLength(0);
  });
});
