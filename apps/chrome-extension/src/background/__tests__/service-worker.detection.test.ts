/**
 * Service worker integration: detection messages drive the toolbar icon; the badge reflects session authority only.
 */
import { describe, it, expect } from "vitest";
import {
  TAB,
  PAGE_URL,
  harness,
  popupSender,
  pageSender,
  openActiveSession,
  lastBadgeText,
  lastIconPath,
  sessionStatus,
} from "./service-worker.suite";

describe("badge derivation", () => {
  it("page-forged detection/activation events cannot set the ON badge", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { comviDetected: true, editorActive: true } },
      pageSender(),
    );
    await harness.dispatchMessage(
      { type: "EDITOR_ACTIVATED", payload: { success: true } },
      pageSender(),
    );
    await harness.flush();

    const badgeTexts = harness.chrome.action.setBadgeText.mock.calls.map(
      ([args]) => (args as { text: string }).text,
    );
    // One render per forged message; both must clear the badge, never set it.
    expect(badgeTexts).toEqual(["", ""]);
  });

  it("the ON badge appears only after a genuine activation", async () => {
    await openActiveSession();
    const badgeTexts = harness.chrome.action.setBadgeText.mock.calls.map(
      (call) => (call[0] as { text: string }).text,
    );
    expect(badgeTexts).toContain("ON");
  });
});

describe("detection messages", () => {
  it("ignores a detection report that did not come from a tab", async () => {
    harness.chrome.action.setIcon.mockClear();

    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: "1.0.0" } },
      popupSender,
    );
    await harness.flush();

    expect(harness.chrome.action.setIcon).not.toHaveBeenCalled();
  });

  it("records the reported SDK version", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: "1.4.2" } },
      pageSender(),
    );
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ comviDetected: true, version: "1.4.2" });
  });

  it("drops a reported version that is not a string", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: 42 } },
      pageSender(),
    );
    await harness.flush();

    expect((await sessionStatus()).version).toBeUndefined();
  });

  it("shows the detected icon for a tab that has no cached state", async () => {
    const freshTab = TAB + 1;
    harness.setTabUrl(freshTab, PAGE_URL);

    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: "1.0.0" } },
      pageSender({ tab: { id: freshTab } as chrome.tabs.Tab }),
    );
    await harness.flush();

    expect(lastIconPath()).toContain("icon-detected-16");
    expect(lastBadgeText()).toBe("");
  });

  it("keeps the ON badge while a detection report arrives for an active session", async () => {
    await openActiveSession();

    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: "1.0.0" } },
      pageSender(),
    );
    await harness.flush();

    expect(lastBadgeText()).toBe("ON");
  });

  it("clears the detection state when the page reports Comvi is gone", async () => {
    await harness.dispatchMessage(
      { type: "COMVI_DETECTED", payload: { version: "1.0.0" } },
      pageSender(),
    );
    await harness.flush();

    await harness.dispatchMessage({ type: "COMVI_NOT_FOUND" }, pageSender());
    await harness.flush();

    expect(await sessionStatus()).toMatchObject({ comviDetected: false });
    expect(lastIconPath()).toContain("icon-inactive-16");
  });
});

describe("COMVI_NOT_FOUND", () => {
  it("records the cleared detection state for a tab with no cached state", async () => {
    const freshTab = 12;
    harness.setTabUrl(freshTab, PAGE_URL);
    harness.chrome.action.setIcon.mockClear();

    await harness.dispatchMessage(
      { type: "COMVI_NOT_FOUND" },
      pageSender({ tab: { id: freshTab } as chrome.tabs.Tab }),
    );
    await harness.flush();

    expect(harness.chrome.action.setIcon).toHaveBeenCalled();
  });

  it("keeps the ON badge while a session is active", async () => {
    await openActiveSession();

    await harness.dispatchMessage({ type: "COMVI_NOT_FOUND" }, pageSender());
    await harness.flush();

    const calls = harness.chrome.action.setBadgeText.mock.calls;
    expect((calls[calls.length - 1]?.[0] as { text?: string })?.text).toBe("ON");
  });
});
