/**
 * Toolbar icon and badge rendering.
 *
 * The icon variant is cosmetic, but the "ON" badge is an authority indicator:
 * it must appear for an active session and for nothing else. Toolbar calls
 * race tab closure, so failures are swallowed only for that expected cause.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeChrome, type Harness } from "./harness";
import { renderBadge, resetBadge } from "../badge";

const TAB = 7;

let harness: Harness;

beforeEach(() => {
  harness = installFakeChrome();
});

/** Let the fire-and-forget toolbar promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function iconCall(): { tabId: number; path: Record<number, string> } {
  const [first] = harness.chrome.action.setIcon.mock.calls[0] as [
    { tabId: number; path: Record<number, string> },
  ];
  return first;
}

describe("icon variant", () => {
  it("shows the detected icon for a page that reports Comvi", () => {
    renderBadge(TAB, true, false);

    expect(iconCall().path[16]).toContain("icon-detected-16");
    expect(iconCall().tabId).toBe(TAB);
  });

  it("shows the detected icon for an active session even without page detection", () => {
    renderBadge(TAB, false, true);

    expect(iconCall().path[16]).toContain("icon-detected-16");
  });

  it("shows the inactive icon when the page reports nothing and no session is open", () => {
    renderBadge(TAB, false, false);

    expect(iconCall().path[16]).toContain("icon-inactive-16");
  });
});

describe("ON badge", () => {
  it("labels the toolbar for an active session", () => {
    renderBadge(TAB, true, true);

    expect(harness.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: TAB });
  });

  it("clears the label when the page is detected but no session is active", () => {
    renderBadge(TAB, true, false);

    expect(harness.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "", tabId: TAB });
  });

  it("paints the brand colors on an active session's badge", () => {
    renderBadge(TAB, true, true);

    expect(harness.chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#19191a",
      tabId: TAB,
    });
    expect(harness.chrome.action.setBadgeTextColor).toHaveBeenCalledWith({
      color: "#d97706",
      tabId: TAB,
    });
  });

  it("leaves the badge colors alone when no session is active", () => {
    renderBadge(TAB, true, false);

    expect(harness.chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
    expect(harness.chrome.action.setBadgeTextColor).not.toHaveBeenCalled();
  });
});

describe("reset", () => {
  it("returns a tab to the inactive icon with no label", () => {
    resetBadge(TAB);

    expect(iconCall().path[16]).toContain("icon-inactive-16");
    expect(iconCall().tabId).toBe(TAB);
    expect(harness.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "", tabId: TAB });
  });
});

describe("toolbar failures", () => {
  it("reports an unexpected toolbar rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.chrome.action.setIcon.mockRejectedValue(new Error("action API unavailable"));

    renderBadge(TAB, true, false);
    await settle();

    expect(warn).toHaveBeenCalledWith(
      "[ComviExtension] Failed to update toolbar state.",
      expect.objectContaining({ message: "action API unavailable" }),
    );
  });

  it("stays quiet when the tab was removed before the toolbar update", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.chrome.action.setIcon.mockRejectedValue(new Error(`No tab with id ${TAB}`));

    renderBadge(TAB, true, false);
    await settle();

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet when the closed-tab failure is not an Error instance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.chrome.action.setIcon.mockRejectedValue(`No tab with id ${TAB}`);

    renderBadge(TAB, true, false);
    await settle();

    expect(warn).not.toHaveBeenCalled();
  });

  it("reports a toolbar call that throws synchronously", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.chrome.action.setIcon.mockImplementation(() => {
      throw new Error("action API unavailable");
    });

    renderBadge(TAB, true, false);
    await settle();

    expect(warn).toHaveBeenCalledWith(
      "[ComviExtension] Failed to update toolbar state.",
      expect.objectContaining({ message: "action API unavailable" }),
    );
  });

  it("stays quiet when a synchronous toolbar call reports a removed tab", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.chrome.action.setIcon.mockImplementation(() => {
      throw new Error(`No tab with id ${TAB}`);
    });

    renderBadge(TAB, true, false);
    await settle();

    expect(warn).not.toHaveBeenCalled();
  });
});
