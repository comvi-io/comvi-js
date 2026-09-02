// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, runtimeFailure, type PopupHarness } from "./harness";

const PAGE_URL = "https://app.example.com/projects/1";
const PAGE_ORIGIN = "https://app.example.com";
const TAB_ID = 42;
const OTHER_TAB_ID = 99;
const NONCE = "activation-nonce-1";

/**
 * Once a session exists the service worker owns it: the popup disables and
 * revokes through it, and only trusts lifecycle news that came from it about
 * the tab this popup is bound to.
 */
describe("popup session lifecycle", () => {
  let popup: PopupHarness;

  beforeEach(() => {
    popup = createPopupHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const startIdle = async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false },
    });
    await popup.start();
  };

  const startActive = async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: true,
      pending: false,
      comviDetected: true,
    });
    await popup.start();
  };

  const startUndetected = async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: false, editorActive: false },
    });
    await popup.start();
  };

  const messagesOfType = (type: string) =>
    popup.serviceWorkerMessages().filter((message) => message.type === type);

  // --- Disable ---

  it("ends the session for this tab when disable is clicked", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", { ok: true });

    popup.disableBtn.click();
    await popup.flush();

    expect(messagesOfType("END_SESSION")).toEqual([
      { type: "END_SESSION", payload: { tabId: TAB_ID } },
    ]);
  });

  it("returns to the idle view once the session ends", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", { ok: true });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("keeps the editor shown as active when the service worker refuses", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", { ok: false });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not disable the editor");
    expect(popup.visibleViews()).toEqual(["active"]);
  });

  it("reports a broken channel when disabling", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", runtimeFailure("Extension context invalidated"));

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Extension context invalidated");
  });

  it("reports a generic failure when the service worker answers nothing", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", undefined);

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not disable the editor");
  });

  it("releases the controls after a failed disable", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", { ok: false });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.disableBtn.disabled).toBe(false);
    expect(popup.disableBtn.textContent).toBe("Disable editor");
  });

  it("ignores a second disable click while one is running", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", new Promise(() => {}));

    popup.disableBtn.click();
    await popup.flush();
    popup.disableBtn.click();
    await popup.flush();

    expect(messagesOfType("END_SESSION")).toHaveLength(1);
  });

  it("does not try to disable when no tab is bound", async () => {
    popup.setActiveTab(null);
    await popup.start();

    popup.disableBtn.click();
    await popup.flush();

    expect(messagesOfType("END_SESSION")).toEqual([]);
  });

  it("reports a torn-down extension context when disabling", async () => {
    await startActive();
    popup.runtimeSendMessage.mockImplementationOnce(() => {
      throw "Extension context invalidated.";
    });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not disable the editor");
  });

  it("clears an earlier error when disabling", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", { ok: false });
    popup.disableBtn.click();
    await popup.flush();
    popup.onServiceWorker("END_SESSION", { ok: true });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  // --- Forget saved key ---

  it("asks the service worker to revoke the key for this origin", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: true });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(messagesOfType("FORGET_CREDENTIALS")).toEqual([
      { type: "FORGET_CREDENTIALS", payload: { origin: PAGE_ORIGIN } },
    ]);
  });

  it("empties the key field and hides the forget action after revocation", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: true });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.apiKeyInput.value).toBe("");
    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(true);
  });

  it("restores the controls and the cursor after revoking the key", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: true });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.enableBtn.disabled).toBe(false);
    expect(popup.operationStatus.classList.contains("hidden")).toBe(true);
    expect(document.activeElement).toBe(popup.apiKeyInput);
  });

  it("clears an earlier error when a new revocation starts", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: false, error: "Session revocation failed" });
    popup.forgetKeyBtn.click();
    await popup.flush();
    popup.onServiceWorker("FORGET_CREDENTIALS", new Promise(() => {}));

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
    expect(popup.errorMsg.textContent).toBe("");
  });

  it("reports a torn-down extension context when revoking", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.runtimeSendMessage.mockImplementationOnce(() => {
      throw "Extension context invalidated.";
    });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not remove the saved key");
  });

  it("does not revoke anything when the popup is not bound to a page", async () => {
    popup.setActiveTab(null);
    await popup.start();

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(messagesOfType("FORGET_CREDENTIALS")).toEqual([]);
  });

  it("keeps the saved key when revocation is refused", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: false, error: "Session revocation failed" });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Session revocation failed");
    expect(popup.apiKeyInput.value).toBe("sk-saved-key");
  });

  it("reports a generic failure when revocation carries no reason", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: false });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not remove the saved key");
  });

  it("reports a generic failure when the service worker answers nothing", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", undefined);

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Could not remove the saved key");
  });

  it("releases the controls after a failed revocation", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", { ok: false });

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.forgetKeyBtn.disabled).toBe(false);
    expect(popup.operationStatus.classList.contains("hidden")).toBe(true);
  });

  it("does not revoke anything on a page without an addressable origin", async () => {
    popup.setActiveTab({ id: TAB_ID, url: "chrome://extensions" });
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: false,
      pending: false,
      comviDetected: true,
    });
    await popup.start();

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(messagesOfType("FORGET_CREDENTIALS")).toEqual([]);
  });

  it("ignores a forget click while another operation runs", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("START_SESSION", new Promise(() => {}));
    popup.apiKeyInput.value = "sk-live-key";
    popup.enableBtn.click();
    await popup.flush();

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(messagesOfType("FORGET_CREDENTIALS")).toEqual([]);
  });

  // --- Service-worker lifecycle notifications ---

  const enablePending = async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.apiKeyInput.value = "sk-live-key";
    popup.enableBtn.click();
    await popup.flush();
  };

  it("shows the active view when the service worker confirms activation", async () => {
    await enablePending();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false, version: "3.1.0" },
    });

    expect(popup.visibleViews()).toEqual(["active"]);
    expect(popup.versionLine.textContent).toBe("Comvi i18n v3.1.0");
    expect(popup.enableBtn.disabled).toBe(false);
  });

  it("clears a stale error when the session goes active", async () => {
    await startIdle();
    popup.enableBtn.click();
    await popup.flush();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  it("leaves an undetected page undetected when a session simply ended", async () => {
    await startUndetected();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: false },
    });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("adopts cached detection carried by a lifecycle notification", async () => {
    await startUndetected();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: false, comviDetected: true },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("redraws for a lifecycle notification that is still pending", async () => {
    await startUndetected();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: true, comviDetected: true },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("treats a page the editor started on as one that has Comvi i18n", async () => {
    await startUndetected();
    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });
    popup.onServiceWorker("END_SESSION", { ok: true });

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("keeps a known version when a later notification omits it", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", {
      active: true,
      pending: false,
      version: "2.4.0",
    });
    await popup.start();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.versionLine.textContent).toBe("Comvi i18n v2.4.0");
  });

  it("ignores an unrelated broadcast from the service worker", async () => {
    await startIdle();

    await popup.fromServiceWorker({
      type: "STATUS_RESPONSE",
      payload: { comviDetected: false, editorActive: false },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("keeps the controls locked while the session is still pending", async () => {
    await enablePending();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: true },
    });

    expect(popup.enableBtn.disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("surfaces the reason an activation failed", async () => {
    await enablePending();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: {
        tabId: TAB_ID,
        active: false,
        pending: false,
        error: "The editor could not start",
      },
    });

    expect(popup.errorMsg.textContent).toBe("The editor could not start");
    expect(popup.enableBtn.disabled).toBe(false);
  });

  it("does not raise an error for a session that ended outside an enable", async () => {
    await startActive();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: false, error: "Session expired" },
    });

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("ignores lifecycle news about another tab", async () => {
    await enablePending();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: OTHER_TAB_ID, active: true, pending: false },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
    expect(popup.enableBtn.disabled).toBe(true);
  });

  it("ignores lifecycle news carrying no payload", async () => {
    await enablePending();

    await popup.fromServiceWorker({ type: "SESSION_STATE_CHANGED" });

    expect(popup.enableBtn.disabled).toBe(true);
  });

  it("refuses lifecycle news that a page's content script sent", async () => {
    await enablePending();

    await popup.fromTab(TAB_ID, {
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
    expect(popup.enableBtn.disabled).toBe(true);
  });

  // --- Content-script notifications ---

  it("updates detection from the bound tab's status report", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: false, editorActive: false },
    });
    await popup.start();

    await popup.fromTab(TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: false, version: "1.9.2" },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("renders the version the page reported once the editor is active", async () => {
    await startUndetected();
    await popup.fromTab(TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: false, version: "1.9.2" },
    });

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.versionLine.textContent).toBe("Comvi i18n v1.9.2");
  });

  it("keeps a page-reported version when a later report omits it", async () => {
    await startUndetected();
    await popup.fromTab(TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: false, version: "1.9.2" },
    });
    await popup.fromTab(TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: false },
    });

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.versionLine.textContent).toBe("Comvi i18n v1.9.2");
  });

  it("ignores a status report from a different tab", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: false, editorActive: false },
    });
    await popup.start();

    await popup.fromTab(OTHER_TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: false },
    });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
  });

  it("does not treat a page status report as proof the editor is active", async () => {
    await startIdle();

    await popup.fromTab(TAB_ID, {
      type: "STATUS_RESPONSE",
      payload: { comviDetected: true, editorActive: true },
    });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("reports progress when the page acknowledges activation", async () => {
    await enablePending();

    await popup.fromTab(TAB_ID, { type: "EDITOR_ACTIVATED", payload: { success: true } });

    expect(popup.operationStatusText.textContent).toBe("Confirming activation…");
    expect(popup.enableBtn.disabled).toBe(true);
  });

  it("reports progress as soon as the page acknowledges, before the command settles", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.onContentScript("ACTIVATE_EDITOR", new Promise(() => {}));
    popup.apiKeyInput.value = "sk-live-key";
    popup.enableBtn.click();
    await popup.flush();
    expect(popup.operationStatusText.textContent).toBe("Starting editor…");

    await popup.fromTab(TAB_ID, { type: "EDITOR_ACTIVATED", payload: { success: true } });

    expect(popup.operationStatusText.textContent).toBe("Confirming activation…");
  });

  it("ignores a page activation acknowledgement outside an enable", async () => {
    await startIdle();

    await popup.fromTab(TAB_ID, { type: "EDITOR_ACTIVATED", payload: { success: true } });

    expect(popup.operationStatusText.textContent).toBe("");
    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("waits for the service worker after the page reports deactivation", async () => {
    await startActive();

    await popup.fromTab(TAB_ID, { type: "EDITOR_DEACTIVATED" });

    expect(popup.visibleViews()).toEqual(["active"]);
  });
});
