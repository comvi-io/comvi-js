// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, runtimeFailure, type PopupHarness } from "./harness";

const PAGE_URL = "https://app.example.com/projects/1";
const PAGE_ORIGIN = "https://app.example.com";
const TAB_ID = 42;
const NONCE = "activation-nonce-1";

/**
 * Enabling the editor is the popup's one privileged flow: it re-verifies the
 * tab, takes a lifecycle lease, opens a pending session with the key, injects
 * the bundled runtime and then waits for the service worker to confirm.
 */
describe("popup enable flow", () => {
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

  const clickEnable = async (apiKey = "sk-live-key") => {
    popup.apiKeyInput.value = apiKey;
    popup.enableBtn.click();
    await popup.flush();
  };

  const messagesOfType = (type: string) =>
    popup.serviceWorkerMessages().filter((message) => message.type === type);

  // --- Guards before anything privileged happens ---

  it("asks for an API key instead of opening a session", async () => {
    await startIdle();

    await clickEnable("");

    expect(popup.errorMsg.textContent).toBe("Please enter an API key");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("puts the cursor back in the empty key field", async () => {
    await startIdle();

    await clickEnable("");

    expect(document.activeElement).toBe(popup.apiKeyInput);
  });

  it("clears an earlier error when a new enable starts", async () => {
    await startIdle();
    await clickEnable("");
    popup.onServiceWorker("START_SESSION", new Promise(() => {}));

    await clickEnable();

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
    expect(popup.errorMsg.textContent).toBe("");
  });

  it("rejects a key that is only whitespace", async () => {
    await startIdle();

    await clickEnable("   ");

    expect(popup.errorMsg.textContent).toBe("Please enter an API key");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("trims the pasted key before sending it to the service worker", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable("  sk-live-key\n");

    expect(messagesOfType("START_SESSION")[0].payload).toMatchObject({ apiKey: "sk-live-key" });
  });

  it("ignores a second click while an enable is already running", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", new Promise(() => {}));

    await clickEnable();
    popup.enableBtn.click();
    await popup.flush();

    expect(messagesOfType("START_SESSION")).toHaveLength(1);
  });

  it("enables on Enter in the API key field", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.apiKeyInput.value = "sk-live-key";

    popup.apiKeyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await popup.flush();

    expect(messagesOfType("START_SESSION")).toHaveLength(1);
  });

  it("ignores other keys in the API key field", async () => {
    await startIdle();
    popup.apiKeyInput.value = "sk-live-key";

    popup.apiKeyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await popup.flush();

    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("ignores Enter while an enable is already running", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", new Promise(() => {}));
    await clickEnable();

    popup.apiKeyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await popup.flush();

    expect(messagesOfType("START_SESSION")).toHaveLength(1);
  });

  // --- Tab re-verification (TOCTOU) ---

  it("refuses to enable when the page navigated to another origin", async () => {
    await startIdle();
    popup.setActiveTab({ id: TAB_ID, url: "https://evil.example.net/page" });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("The page changed. Close and reopen the popup.");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("refuses to enable when another tab became active", async () => {
    await startIdle();
    popup.setActiveTab({ id: TAB_ID + 1, url: PAGE_URL });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("The page changed. Close and reopen the popup.");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("refuses to enable when the active tab is gone", async () => {
    await startIdle();
    popup.setActiveTab(null);

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("The page changed. Close and reopen the popup.");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("refuses to enable when the tab no longer reports a url", async () => {
    await startIdle();
    popup.setActiveTab({ id: TAB_ID });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("The page changed. Close and reopen the popup.");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("refuses to enable when the page moved to a non-addressable url", async () => {
    await startIdle();
    popup.setActiveTab({ id: TAB_ID, url: "chrome://extensions" });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("The page changed. Close and reopen the popup.");
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("releases the controls after refusing a changed page", async () => {
    await startIdle();
    popup.setActiveTab(null);

    await clickEnable();

    expect(popup.enableBtn.disabled).toBe(false);
    expect(popup.enableBtn.textContent).toBe("Enable editor");
  });

  // --- Popup lifecycle lease ---

  it("does not open a lifecycle port just to show status", async () => {
    await startIdle();

    expect(popup.leaseConnections()).toEqual([]);
  });

  it("opens the lifecycle port when the user enables the editor", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.leaseConnections()).toEqual([{ name: "comvi-popup-lifecycle" }]);
  });

  it("reuses one lifecycle port across repeated enable attempts", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: false, error: "Invalid API key" });

    await clickEnable();
    await clickEnable();

    expect(popup.leaseConnections()).toHaveLength(1);
  });

  it("reports a lost popup connection instead of opening a session", async () => {
    await startIdle();
    popup.setLeaseBehaviour("disconnect");

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe(
      "The popup connection closed. Reopen it and try again.",
    );
    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("opens a fresh lifecycle port after the previous one dropped", async () => {
    await startIdle();
    popup.setLeaseBehaviour("disconnect");
    await clickEnable();

    await clickEnable();

    expect(popup.leaseConnections()).toHaveLength(2);
  });

  it("does not open a session on a registration meant for another popup", async () => {
    await startIdle();
    popup.setLeaseBehaviour("wrong-lease");

    await clickEnable();

    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("does not treat any other port message as a lease registration", async () => {
    await startIdle();
    popup.setLeaseBehaviour("other-message");

    await clickEnable();

    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  it("does not open a session while the lease is unacknowledged", async () => {
    await startIdle();
    popup.setLeaseBehaviour("silent");

    await clickEnable();

    expect(messagesOfType("START_SESSION")).toEqual([]);
  });

  // --- Session handshake ---

  it("sends the tab, origin and key to the service worker", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(messagesOfType("START_SESSION")[0].payload).toMatchObject({
      tabId: TAB_ID,
      origin: PAGE_ORIGIN,
      apiKey: "sk-live-key",
    });
  });

  it("binds the session to this popup's lifecycle lease", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    const payload = messagesOfType("START_SESSION")[0].payload as { popupLeaseId?: unknown };
    expect(payload.popupLeaseId).toBe(popup.registeredLeaseId());
    expect(payload.popupLeaseId).toEqual(expect.any(String));
  });

  it("surfaces the service worker's reason for rejecting the key", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: false, error: "That API key is not valid" });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("That API key is not valid");
  });

  it("reports a generic failure when the rejection carries no reason", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: false });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("Could not validate the API key");
  });

  it("treats an accepted session without a nonce as a failure", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true });

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("Could not validate the API key");
    expect(popup.executeScript).not.toHaveBeenCalled();
  });

  it("reports a generic failure when the service worker answers nothing", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", undefined);

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("Could not validate the API key");
  });

  it("surfaces a broken service-worker channel", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", runtimeFailure("Extension context invalidated"));

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("Extension context invalidated");
    expect(popup.enableBtn.disabled).toBe(false);
  });

  // --- Injection and activation ---

  it("injects the bundled editor runtime into the page's main world", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.executeScript).toHaveBeenCalledWith({
      target: { tabId: TAB_ID },
      files: ["editor.iife.js"],
      world: "MAIN",
    });
  });

  it("does not re-inject the runtime the page already loaded", async () => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false });
    popup.onContentScript("GET_STATUS", {
      payload: { comviDetected: true, editorActive: false, editorLoaded: true },
    });
    await popup.start();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.executeScript).not.toHaveBeenCalled();
  });

  it("reports that the editor is starting while the runtime is injected", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.executeScript.mockImplementation(() => new Promise(() => {}));

    await clickEnable();

    expect(popup.operationStatusText.textContent).toBe("Starting editor…");
  });

  it("does not inject the runtime again on a second attempt", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.onContentScript("ACTIVATE_EDITOR", runtimeFailure("Receiving end does not exist"));
    await clickEnable();

    await clickEnable();

    expect(popup.executeScript).toHaveBeenCalledTimes(1);
  });

  it("activates the editor with the API origin and the session nonce", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.contentScriptMessages()).toContainEqual({
      tabId: TAB_ID,
      message: {
        type: "ACTIVATE_EDITOR",
        payload: { apiBaseUrl: "https://api.comvi.io", nonce: NONCE },
      },
    });
  });

  it("waits for the service worker after the page is told to activate", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.operationStatusText.textContent).toBe("Confirming activation…");
    expect(popup.enableBtn.disabled).toBe(true);
  });

  it("offers to forget the key once a session has been opened with it", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(false);
  });

  it("rolls the pending session back when injection is refused", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));

    await clickEnable();

    expect(messagesOfType("ROLLBACK_ACTIVATION")).toEqual([
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB_ID, nonce: NONCE } },
    ]);
    expect(popup.errorMsg.textContent).toBe("Cannot access contents of the page");
  });

  it("rolls the pending session back when the page cannot be told to activate", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.onContentScript("ACTIVATE_EDITOR", runtimeFailure("Receiving end does not exist"));

    await clickEnable();

    expect(messagesOfType("ROLLBACK_ACTIVATION")).toHaveLength(1);
    expect(popup.errorMsg.textContent).toBe("Receiving end does not exist");
  });

  it("cancels the activation deadline when injection is refused", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));

    await clickEnable();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the controls after a failed activation", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));

    await clickEnable();

    expect(popup.enableBtn.disabled).toBe(false);
    expect(popup.enableBtn.textContent).toBe("Enable editor");
  });

  it("reports a non-Error injection failure in plain language", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.executeScript.mockRejectedValue("frame removed");

    await clickEnable();

    expect(popup.errorMsg.textContent).toBe("Failed to enable editor");
  });

  // --- Activation deadline ---

  it("arms an activation deadline once the session is pending", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });

    await clickEnable();

    expect(vi.getTimerCount()).toBe(1);
  });

  it("gives up on an editor that never acknowledges", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    await clickEnable();

    await vi.advanceTimersByTimeAsync(15_000);
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe(
      "The editor did not respond. Reload the page and try again.",
    );
    expect(messagesOfType("ROLLBACK_ACTIVATION")).toHaveLength(1);
    expect(popup.enableBtn.disabled).toBe(false);
  });

  it("keeps waiting while the deadline has not passed", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    await clickEnable();

    await vi.advanceTimersByTimeAsync(14_999);
    await popup.flush();

    expect(messagesOfType("ROLLBACK_ACTIVATION")).toEqual([]);
    expect(popup.enableBtn.disabled).toBe(true);
  });

  it("shows the active editor when the deadline lost a race it should have lost", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    await clickEnable();
    // The session did become active; only the confirmation message was lost.
    popup.onServiceWorker("GET_SESSION_STATUS", { active: true, pending: false });

    await vi.advanceTimersByTimeAsync(15_000);
    await popup.flush();

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
    expect(popup.visibleViews()).toEqual(["active"]);
  });

  it("cancels the deadline when the service worker confirms the session", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    await clickEnable();

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(vi.getTimerCount()).toBe(0);
  });
});
