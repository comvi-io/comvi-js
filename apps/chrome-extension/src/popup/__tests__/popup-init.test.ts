// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, runtimeFailure, type PopupHarness } from "./harness";

const PAGE_URL = "https://app.example.com/projects/1";
const PAGE_ORIGIN = "https://app.example.com";
const TAB_ID = 42;

/**
 * Opening the popup resolves the active tab and then fans out into three
 * independent sources — saved credentials, the service worker's authoritative
 * session state, and the page's own detector — none of which may block the
 * others.
 */
describe("popup startup", () => {
  let popup: PopupHarness;

  beforeEach(() => {
    popup = createPopupHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const detectedPage = () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false },
    });
  };

  it("shows the loading view until the active tab resolves", async () => {
    popup.tabsQuery.mockImplementationOnce(() => new Promise(() => {}));

    await popup.start();

    expect(popup.visibleViews()).toEqual(["loading"]);
  });

  it("reports not detected when the window has no active tab", async () => {
    popup.setActiveTab(null);

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("reports not detected when the active tab has no id", async () => {
    popup.setActiveTab({ url: PAGE_URL });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("reports not detected when the active tab has no url", async () => {
    popup.setActiveTab({ id: TAB_ID });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("does not query the page when the window has no active tab", async () => {
    popup.setActiveTab(null);

    await popup.start();

    expect(popup.contentScriptMessages()).toEqual([]);
  });

  it("asks the page for its status once the tab is known", async () => {
    detectedPage();

    await popup.start();

    expect(popup.contentScriptMessages()).toEqual([
      { tabId: TAB_ID, message: { type: "GET_STATUS" } },
    ]);
  });

  it("shows the idle view when the page reports Comvi i18n", async () => {
    detectedPage();

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("shows the not-detected view when the page reports no Comvi i18n", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: false, editorActive: false },
    });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("stops showing the loading view even when the page never answers", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", undefined);

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  // --- Content-script repair ---

  it("injects both content scripts when the page does not answer", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });

    await popup.start();

    expect(popup.executeScript.mock.calls.map(([options]) => options)).toEqual([
      { target: { tabId: TAB_ID }, files: ["bridge.js"] },
      { target: { tabId: TAB_ID }, files: ["detector.js"], world: "MAIN" },
    ]);
  });

  it("does not inject content scripts when the page already answered", async () => {
    detectedPage();

    await popup.start();

    expect(popup.executeScript).not.toHaveBeenCalled();
  });

  it("re-asks the page for its status after repairing the content scripts", async () => {
    let attempt = 0;
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", () =>
      ++attempt === 1 ? undefined : { payload: { comviDetected: true, editorActive: false } },
    );

    await popup.start();

    expect(attempt).toBe(2);
    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("stays not detected on a page that refuses script injection", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await popup.start();

    expect(popup.contentScriptMessages()).toHaveLength(1);
    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("injects the content scripts when the page's messaging channel is broken", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", runtimeFailure("Receiving end does not exist"));

    await popup.start();

    expect(popup.executeScript).toHaveBeenCalled();
  });

  it("treats a page status without a payload as no answer", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {});

    await popup.start();

    expect(popup.executeScript).toHaveBeenCalled();
  });

  // --- Authoritative session state ---

  it("asks the service worker for the session state of this tab", async () => {
    detectedPage();

    await popup.start();

    expect(popup.serviceWorkerMessages()).toEqual([
      { type: "GET_SESSION_STATUS", payload: { tabId: TAB_ID } },
    ]);
  });

  it("shows the active view when the service worker reports a live session", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: true, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: false, editorActive: false },
    });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["active"]);
  });

  it("renders the version reported with the live session", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: true,
      pending: false,
      version: "2.4.0",
    });

    await popup.start();

    expect(popup.versionLine.textContent).toBe("Comvi i18n v2.4.0");
  });

  it("leaves the version line empty when no version is known", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: true, pending: false });

    await popup.start();

    expect(popup.versionLine.textContent).toBe("");
  });

  it("shows the idle view from cached detection when the page cannot be reached", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: false,
      pending: false,
      comviDetected: true,
    });
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("applies cached detection when the page answered without a status", async () => {
    let releaseSessionStatus!: (value: unknown) => void;
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onContentScript("GET_STATUS", {});
    popup.onServiceWorker(
      "GET_SESSION_STATUS",
      new Promise((resolve) => {
        releaseSessionStatus = resolve;
      }),
    );
    await popup.start();

    releaseSessionStatus({ active: false, pending: false, comviDetected: true });
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("shows the page result while the service worker is still answering", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", new Promise(() => {}));
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false },
    });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("reports not detected when no source answers and injection is refused", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", new Promise(() => {}));
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await popup.start();

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("shows cached detection while the page is still being asked", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onContentScript("GET_STATUS", new Promise(() => {}));
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: false,
      pending: false,
      comviDetected: true,
    });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("shows a live session while the page is still being asked", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onContentScript("GET_STATUS", new Promise(() => {}));
    popup.onServiceWorker("GET_SESSION_STATUS", { active: true, pending: false });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["active"]);
  });

  it("keeps loading while neither source has produced a result", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onContentScript("GET_STATUS", new Promise(() => {}));
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["loading"]);
  });

  it("keeps the live page status when cached detection arrives later", async () => {
    let releaseSessionStatus!: (value: unknown) => void;
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false },
    });
    popup.onServiceWorker(
      "GET_SESSION_STATUS",
      new Promise((resolve) => {
        releaseSessionStatus = resolve;
      }),
    );
    await popup.start();

    releaseSessionStatus({ active: false, pending: false, comviDetected: false });
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("keeps rendering when the service worker is asleep and answers nothing", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", undefined);
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false },
    });

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  // --- Saved credentials ---

  it("prefills the API key saved for this origin", async () => {
    detectedPage();
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");

    await popup.start();

    expect(popup.apiKeyInput.value).toBe("sk-saved-key");
  });

  it("offers to forget the key once a saved one is loaded", async () => {
    detectedPage();
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");

    await popup.start();

    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(false);
  });

  it("hides the forget action when no key is saved for this origin", async () => {
    detectedPage();
    await popup.seedCredentials("https://other.example.com", "sk-other-key");

    await popup.start();

    expect(popup.apiKeyInput.value).toBe("");
    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(true);
  });

  it("does not overwrite a key the user typed while storage was slow", async () => {
    detectedPage();
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    popup.holdStorageReads();
    await popup.start();

    popup.apiKeyInput.value = "sk-typed-by-hand";
    popup.apiKeyInput.dispatchEvent(new Event("input"));
    await popup.releaseStorageReads();

    expect(popup.apiKeyInput.value).toBe("sk-typed-by-hand");
  });

  it("does not repopulate a field the user deliberately cleared", async () => {
    detectedPage();
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    popup.holdStorageReads();
    await popup.start();

    popup.apiKeyInput.value = "";
    popup.apiKeyInput.dispatchEvent(new Event("input"));
    await popup.releaseStorageReads();

    expect(popup.apiKeyInput.value).toBe("");
  });

  it("does not overwrite a key a password manager already filled in", async () => {
    detectedPage();
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    popup.holdStorageReads();
    await popup.start();

    popup.apiKeyInput.value = "sk-filled-by-manager";
    await popup.releaseStorageReads();

    expect(popup.apiKeyInput.value).toBe("sk-filled-by-manager");
  });

  it("renders the page state even when extension storage is unreadable", async () => {
    detectedPage();
    popup.storageGet.mockRejectedValue(new Error("storage unavailable"));

    await popup.start();

    expect(popup.visibleViews()).toEqual(["idle"]);
    expect(popup.apiKeyInput.value).toBe("");
  });

  it("offers no saved key on a page whose origin is not addressable", async () => {
    popup.setActiveTab({ id: TAB_ID, url: "chrome://extensions" });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");

    await popup.start();

    expect(popup.apiKeyInput.value).toBe("");
    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(true);
  });
});
