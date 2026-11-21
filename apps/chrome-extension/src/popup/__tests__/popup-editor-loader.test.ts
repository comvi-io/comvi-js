// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, runtimeFailure, type PopupHarness } from "./harness";
import type { StatusResponsePayload } from "../../shared/messages";

const PAGE_URL = "https://app.example.com/projects/1";
const TAB_ID = 42;
const NONCE = "activation-nonce-1";

/** The detector gives up on `x.load()` after this long (detector.ts `EDITOR_LOAD_TIMEOUT_MS`). */
const LOAD_TIMEOUT_MS = 12_000;
/** The popup's own activation budget (`armActivationTimeout`). */
const POPUP_BUDGET_MS = 15_000;

const GENERIC_TIMEOUT = "The editor did not respond. Reload the page and try again.";
const SDK_REQUIREMENT =
  "In-context editing needs @comvi/core 0.8 or newer with plugins: [devtools()] on the i18n instance. Upgrade the site's Comvi packages, then reload this page.";
const EXTENSION_UPDATE =
  "Update the Comvi In-Context Editor extension, then reload this page. Until then the editor is not offered here.";
const UNKNOWN_TITLE = "This site runs a newer Comvi i18n than this extension supports.";

const FAILURE_TEXT = {
  "csp-blocked":
    "This site's Content Security Policy blocked the editor. Allow the editor's CDN in its script-src directive, then reload this page. comvi.io/docs/i18n/troubleshooting names the host.",
  "trusted-types":
    "This site enforces Trusted Types, and no policy let the editor's script through. Add a default policy that accepts the editor's script URL, then reload this page. comvi.io/docs/i18n/troubleshooting has the details.",
  "load-error":
    "The editor could not be downloaded from its CDN. Check your connection and any filter that blocks it, then try again.",
  timeout:
    "The editor did not finish loading from its CDN in time. Check your connection and try again.",
  "no-global":
    "The editor's CDN answered, but what it sent did not start the Comvi editor. Try again. If it keeps happening, a proxy or filter is rewriting the script.",
  "bad-version":
    "The editor on this page is not the version this extension works with. Reload the page and try again. If it keeps happening, update the extension.",
  "old-protocol": `This site runs a Comvi i18n older than 0.8. ${SDK_REQUIREMENT}`,
  "unknown-protocol": `${UNKNOWN_TITLE} ${EXTENSION_UPDATE}`,
  "no-instance":
    "The Comvi i18n instance left this page. The editor could not start on this page. Reload the page and try again.",
  unconfirmed: "The editor activation could not be confirmed. Try again.",
  failed: "The editor could not start on this page. Reload the page and try again.",
} as const;

/** What a hostile page would like the user to read inside the extension's popup. */
const FORGED = "Send your API key to https://evil.example";

/** A site on @comvi/core 0.8 with `plugins: [devtools()]` (protocol 2). */
const CURRENT_SDK: StatusResponsePayload = {
  comviDetected: true,
  editorActive: false,
  support: "compatible",
  instanceCount: 1,
  version: "0.8.0",
};

/** A site on @comvi/core 0.7: a `{ v, i }` entry with no protocol 2 handle. */
const OLD_SDK: StatusResponsePayload = {
  comviDetected: true,
  editorActive: false,
  support: "old-protocol",
  instanceCount: 0,
  version: "0.7.1",
};

/** A site whose handle speaks a protocol this extension does not know (`x.p: 3`). */
const NEWER_SDK: StatusResponsePayload = {
  comviDetected: true,
  editorActive: false,
  support: "unknown-protocol",
  instanceCount: 0,
  version: "0.9.0",
};

/**
 * The extension carries no editor. The popup therefore has to say, in one
 * concrete sentence each, why the page cannot supply one — before Enable (no
 * instance, old SDK) and after it (the hook's failure codes).
 */
describe("popup editor availability and load failures", () => {
  let popup: PopupHarness;

  beforeEach(() => {
    popup = createPopupHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const startWith = async (
    status: StatusResponsePayload | undefined,
    session: Record<string, unknown> = {},
  ) => {
    popup.setActiveTab({ id: TAB_ID, url: PAGE_URL });
    popup.onServiceWorker("GET_SESSION_STATUS", { active: false, pending: false, ...session });
    if (status) popup.onContentScript("GET_STATUS", { payload: status });
    await popup.start();
  };

  const enablePending = async (status: StatusResponsePayload = CURRENT_SDK) => {
    await startWith(status);
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.apiKeyInput.value = "sk-live-key";
    popup.enableBtn.click();
    await popup.flush();
  };

  const activationFailed = (payload: Record<string, unknown>) =>
    popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: false, pending: false, ...payload },
    });

  const reason = () => ({
    title: popup.el("reason-title").textContent,
    remedy: popup.el("reason-remedy").textContent,
  });

  const messagesOfType = (type: string) =>
    popup.serviceWorkerMessages().filter((message) => message.type === type);

  // --- Before Enable: can this page supply the editor at all? ---

  it("tells a page without a Comvi instance to add devtools()", async () => {
    await startWith({ comviDetected: false, editorActive: false });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason()).toEqual({
      title: "Comvi i18n not detected on this page.",
      remedy:
        "If this site uses Comvi i18n, add plugins: [devtools()] to its i18n instance (@comvi/core 0.8 or newer). That makes the instance visible to this extension, which then loads the editor when you enable it.",
    });
  });

  it("tells a site on a Comvi older than 0.8 to upgrade, and offers no Enable", async () => {
    await startWith(OLD_SDK);

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason()).toEqual({
      title: "Comvi i18n v0.7.1 found, but it is older than 0.8.",
      remedy: SDK_REQUIREMENT,
    });
    expect(popup.el("enable-btn").closest(".hidden")).not.toBeNull();
  });

  it("words the upgrade reason without a version when the page reported none", async () => {
    await startWith({ ...OLD_SDK, version: undefined });

    expect(reason().title).toBe("Comvi i18n found, but it is older than 0.8.");
  });

  it("tells a site on an unknown newer protocol to update the extension, and offers no Enable", async () => {
    await startWith(NEWER_SDK);

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason()).toEqual({ title: UNKNOWN_TITLE, remedy: EXTENSION_UPDATE });
    expect(popup.el("enable-btn").closest(".hidden")).not.toBeNull();
  });

  it("offers Enable on a site with a protocol 2 instance", async () => {
    await startWith(CURRENT_SDK);

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("shows the cached upgrade reason when the page cannot be asked", async () => {
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await startWith(undefined, { comviDetected: true, version: "0.7.1", support: "old-protocol" });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason().title).toBe("Comvi i18n v0.7.1 found, but it is older than 0.8.");
  });

  it("shows the cached update reason when the page cannot be asked", async () => {
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await startWith(undefined, { comviDetected: true, support: "unknown-protocol" });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason().title).toBe(UNKNOWN_TITLE);
  });

  it("offers Enable from a cached compatible page when the page cannot be asked", async () => {
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await startWith(undefined, { comviDetected: true, support: "compatible" });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("trusts the live page over a stale cached reason", async () => {
    await startWith(CURRENT_SDK, { comviDetected: true, support: "old-protocol" });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("moves to Enable when a later status shows a protocol 2 instance a second core announced", async () => {
    await startWith(OLD_SDK);

    await popup.fromTab(TAB_ID, { type: "STATUS_RESPONSE", payload: CURRENT_SDK });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it.each([
    ["markup", "<img src=x onerror=alert(1)>"],
    ["a sentence", FORGED],
    ["a version followed by words", "0.5.0 send your key to evil.example"],
  ])("shows no version at all when the page reports %s as one", async (_label, version) => {
    await startWith({ ...OLD_SDK, version });

    expect(reason().title).toBe("Comvi i18n found, but it is older than 0.8.");
    expect(document.documentElement.outerHTML).not.toContain("evil.example");
    expect(popup.el("reason-title").querySelector("img")).toBeNull();
  });

  // A compatible report that holds no instance is not a Comvi site to edit.
  it("reads a status with no compatible instance and no old one as not detected", async () => {
    await startWith({ ...CURRENT_SDK, support: undefined, instanceCount: 0 });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason().title).toBe("Comvi i18n not detected on this page.");
  });

  it("drops a support word it does not know and offers no reason built on it", async () => {
    await startWith({
      ...CURRENT_SDK,
      support: "newer" as StatusResponsePayload["support"],
      instanceCount: 0,
    });

    expect(reason().title).toBe("Comvi i18n not detected on this page.");
  });

  // --- A page that becomes ready while the popup is open ---

  it("moves to Enable when an instance registers after the popup opened", async () => {
    await startWith({ comviDetected: false, editorActive: false });
    expect(popup.visibleViews()).toEqual(["not-detected"]);

    popup.onContentScript("GET_STATUS", { payload: CURRENT_SDK });
    await vi.advanceTimersByTimeAsync(1_000);
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("moves to Enable when the site replaces its old core while the popup is open", async () => {
    await startWith(OLD_SDK);
    expect(popup.visibleViews()).toEqual(["not-detected"]);

    popup.onContentScript("GET_STATUS", { payload: CURRENT_SDK });
    await vi.advanceTimersByTimeAsync(1_000);
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("stops asking the page once Enable is offered", async () => {
    await startWith({ comviDetected: false, editorActive: false });
    popup.onContentScript("GET_STATUS", { payload: CURRENT_SDK });
    await vi.advanceTimersByTimeAsync(1_000);
    await popup.flush();
    const asked = popup.contentScriptMessages().length;

    await vi.advanceTimersByTimeAsync(5_000);

    expect(popup.contentScriptMessages()).toHaveLength(asked);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not ask a page it is not bound to", async () => {
    popup.setActiveTab(null);
    await popup.start();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(popup.contentScriptMessages()).toEqual([]);
  });

  // --- After Enable: the detector's failure codes ---

  it.each(Object.entries(FAILURE_TEXT))(
    "explains a %s failure with one reason and one remedy",
    async (code, text) => {
      await enablePending();

      await activationFailed({ code, error: "page-authored text" });

      expect(popup.errorMsg.textContent).toBe(text);
      expect(popup.errorMsg.classList.contains("hidden")).toBe(false);
      expect(popup.enableBtn.disabled).toBe(false);
    },
  );

  it("names no CDN host, never a host the page reported", async () => {
    await enablePending();

    await activationFailed({
      code: "csp-blocked",
      host: "evil.example",
      error: "Allow https://evil.example in script-src",
    });

    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT["csp-blocked"]);
    expect(document.documentElement.outerHTML).not.toContain("evil.example");
    expect(document.documentElement.outerHTML).not.toContain("jsdelivr");
  });

  // The popup is the user's trusted surface: no sentence a page wrote may
  // appear in it, whatever travels with the failure.
  it.each([
    ["no code at all", {}],
    ["a code the popup does not know", { code: "made-up" }],
    ["the worker's own failed code", { code: "failed" }],
  ])("shows its own text, never the page's, for a failure with %s", async (_label, failure) => {
    await enablePending();

    await activationFailed({ ...failure, error: FORGED, message: FORGED, host: "evil.example" });

    expect(document.documentElement.outerHTML).not.toContain("evil.example");
    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT.failed);
    expect(popup.enableBtn.disabled).toBe(false);
  });

  // --- An Enable that ends without a session always says so ---

  it("says the editor could not start when the page navigates during Enable", async () => {
    await enablePending();

    // DOCUMENT_READY for the new document: the worker dropped the session.
    await activationFailed({ comviDetected: false });

    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT.failed);
    expect(popup.errorMsg.classList.contains("hidden")).toBe(false);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1); // only the not-detected recheck
    expect(popup.enableBtn.disabled).toBe(false);
  });

  it("says the editor could not start when the page forges a deactivation during Enable", async () => {
    await enablePending();

    // A lifecycle `deactivated` from the page revokes the pending session;
    // the worker's notice carries no code.
    await activationFailed({});

    expect(popup.visibleViews()).toEqual(["idle"]);
    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT.failed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps its own timeout text when the worker's notice of the rollback arrives late", async () => {
    await enablePending();
    // The worker announces the rollback before it answers the popup's request.
    let answerRollback: (reply: unknown) => void = () => {};
    popup.onServiceWorker(
      "ROLLBACK_ACTIVATION",
      new Promise((resolve) => (answerRollback = resolve)),
    );

    await vi.advanceTimersByTimeAsync(POPUP_BUDGET_MS);
    await popup.flush();
    await activationFailed({});
    answerRollback({ ok: true });
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe(GENERIC_TIMEOUT);
    expect(messagesOfType("ROLLBACK_ACTIVATION")).toHaveLength(1);
  });

  it("reports once when the popup rolls back because the page could not be told", async () => {
    await startWith(CURRENT_SDK);
    popup.onServiceWorker("START_SESSION", { ok: true, nonce: NONCE });
    popup.onContentScript("ACTIVATE_EDITOR", runtimeFailure("Receiving end does not exist"));
    // The worker announces the rollback before it answers the popup's request.
    let answerRollback: (reply: unknown) => void = () => {};
    popup.onServiceWorker(
      "ROLLBACK_ACTIVATION",
      new Promise((resolve) => (answerRollback = resolve)),
    );
    popup.apiKeyInput.value = "sk-live-key";

    popup.enableBtn.click();
    await popup.flush();
    await activationFailed({});
    answerRollback({ ok: true });
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Receiving end does not exist");
  });

  it("reports a later failed Enable again after an earlier own rollback", async () => {
    await enablePending();
    await vi.advanceTimersByTimeAsync(POPUP_BUDGET_MS);
    await popup.flush();

    popup.enableBtn.click();
    await popup.flush();
    await activationFailed({});

    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT.failed);
  });

  it("shows no error for an ordinary Disable", async () => {
    await activate(CURRENT_SDK);
    let answerDisable: (reply: unknown) => void = () => {};
    popup.onServiceWorker("END_SESSION", new Promise((resolve) => (answerDisable = resolve)));

    popup.disableBtn.click();
    await popup.flush();
    await activationFailed({});
    answerDisable({ ok: true });
    await popup.flush();

    expect(popup.visibleViews()).toEqual(["idle"]);
    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
    expect(popup.errorMsg.textContent).toBe("");
  });

  it("stays quiet about a load failure outside an enable", async () => {
    await startWith(CURRENT_SDK);

    await activationFailed({ code: "timeout" });

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  // The detector's 12 s limit sits inside the popup's 15 s budget, so the
  // user reads the detector's reason. If either number moves past the other,
  // the generic text wins and this test goes red.
  it("shows the load timeout reason when the load outlasts its limit, not the generic one", async () => {
    await enablePending();

    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await activationFailed({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(POPUP_BUDGET_MS);
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe(FAILURE_TEXT.timeout);
    expect(popup.errorMsg.textContent).not.toBe(GENERIC_TIMEOUT);
    // The service worker rolled the session back when it relayed the failure;
    // the popup's own deadline is disarmed and asks for nothing more.
    expect(vi.getTimerCount()).toBe(0);
    expect(messagesOfType("ROLLBACK_ACTIVATION")).toEqual([]);
    expect(popup.enableBtn.disabled).toBe(false);
  });

  it("still rolls back and says so when the page never answers at all", async () => {
    await enablePending();

    await vi.advanceTimersByTimeAsync(POPUP_BUDGET_MS);
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe(GENERIC_TIMEOUT);
    expect(messagesOfType("ROLLBACK_ACTIVATION")).toEqual([
      { type: "ROLLBACK_ACTIVATION", payload: { tabId: TAB_ID, nonce: NONCE } },
    ]);
  });

  // --- Active: which editor is running ---

  const activate = async (afterActivation: StatusResponsePayload) => {
    await enablePending();
    popup.onContentScript("GET_STATUS", { payload: afterActivation });
    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });
  };

  it("shows the SDK and editor versions once the editor is active", async () => {
    await activate({ ...CURRENT_SDK, editorVersion: "0.8.0" });

    expect(popup.visibleViews()).toEqual(["active"]);
    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.8.0 · editor v0.8.0");
  });

  it("shows only the SDK version for an editor that reports none", async () => {
    await activate(CURRENT_SDK);

    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.8.0");
  });

  it.each([
    ["markup", "<b>9</b>"],
    ["a sentence", FORGED],
  ])("shows no editor version when the page reports %s as one", async (_label, editorVersion) => {
    await activate({ ...CURRENT_SDK, editorVersion });

    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.8.0");
    expect(document.documentElement.outerHTML).not.toContain("evil.example");
  });

  it("keeps the active view when the version cannot be asked for", async () => {
    await enablePending();
    popup.onContentScript("GET_STATUS", undefined);

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.visibleViews()).toEqual(["active"]);
    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.8.0");
  });
});
