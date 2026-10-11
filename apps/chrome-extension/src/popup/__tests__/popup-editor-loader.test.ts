// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, type PopupHarness } from "./harness";
import type { StatusResponsePayload } from "../../shared/messages";

const PAGE_URL = "https://app.example.com/projects/1";
const TAB_ID = 42;
const NONCE = "activation-nonce-1";

/** The page's `devtools()` hook gives up after this long (contract: `load()`). */
const HOOK_TIMEOUT_MS = 10_000;
/** The popup's own activation budget (`armActivationTimeout`). */
const POPUP_BUDGET_MS = 15_000;

const GENERIC_TIMEOUT = "The editor did not respond. Reload the page and try again.";
const SDK_REQUIREMENT =
  "In-context editing needs @comvi/core 0.5.1 or newer with .use(devtools()) on the i18n instance. Upgrade the site's Comvi packages, then reload this page.";

const FAILURE_TEXT = {
  "csp-blocked":
    "This site's Content Security Policy blocked the editor. Allow https://cdn.jsdelivr.net in its script-src directive, then reload this page. If the site enforces Trusted Types, its policy must permit that URL too.",
  "load-error":
    "The editor could not be downloaded from cdn.jsdelivr.net. Check your connection and any filter that blocks that host, then try again. If the site pins an editor version, check that the version exists.",
  timeout:
    "The editor did not finish loading from cdn.jsdelivr.net within 10 seconds. Check your connection and try again.",
  "no-global":
    "cdn.jsdelivr.net answered, but what it sent did not start the Comvi editor. Try again. If it keeps happening, a proxy or filter is rewriting the script.",
  "no-loader": `The Comvi i18n on this page cannot load the editor. ${SDK_REQUIREMENT}`,
} as const;

/** A site on @comvi/core 0.5.1 with `.use(devtools())`. */
const CURRENT_SDK: StatusResponsePayload = {
  comviDetected: true,
  editorActive: false,
  editorLoaded: false,
  editorLoader: { protocol: 1, sdkVersion: "0.5.1", editorVersion: "latest" },
  version: "0.5.1",
};

/** A site on @comvi/core 0.5.0: announced, but no hook to load the editor. */
const OLD_SDK: StatusResponsePayload = {
  comviDetected: true,
  editorActive: false,
  editorLoaded: false,
  editorLoader: null,
  version: "0.5.0",
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
    await startWith({ comviDetected: false, editorActive: false, editorLoader: null });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason()).toEqual({
      title: "Comvi i18n not detected on this page.",
      remedy:
        "If this site uses Comvi i18n, add .use(devtools()) to its i18n instance (@comvi/core 0.5.1 or newer). That makes the instance visible to this extension and lets the site load the editor when you enable it.",
    });
  });

  it("tells a site on @comvi/core 0.5.0 to upgrade, naming the version it found", async () => {
    await startWith(OLD_SDK);

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason()).toEqual({
      title: "Comvi i18n v0.5.0 found, but it cannot load the editor.",
      remedy: SDK_REQUIREMENT,
    });
  });

  it("words the upgrade reason without a version when the page reported none", async () => {
    await startWith({ ...OLD_SDK, version: undefined });

    expect(reason().title).toBe("Comvi i18n found, but it cannot load the editor.");
  });

  it("offers Enable on a site with the loader hook", async () => {
    await startWith(CURRENT_SDK);

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("offers Enable on a site that carries the editor itself and has no hook", async () => {
    await startWith({ ...OLD_SDK, editorLoaded: true });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("shows the cached upgrade reason when the page cannot be asked", async () => {
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await startWith(undefined, { comviDetected: true, version: "0.5.0", editorAvailable: false });

    expect(popup.visibleViews()).toEqual(["not-detected"]);
    expect(reason().title).toBe("Comvi i18n v0.5.0 found, but it cannot load the editor.");
  });

  it("offers Enable from cached availability when the page cannot be asked", async () => {
    popup.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await startWith(undefined, { comviDetected: true, editorAvailable: true });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("trusts the live page over a stale cached reason", async () => {
    await startWith(CURRENT_SDK, { comviDetected: true, editorAvailable: false });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("moves to Enable when a later status shows the hook a second core installed", async () => {
    await startWith(OLD_SDK);

    await popup.fromTab(TAB_ID, { type: "STATUS_RESPONSE", payload: CURRENT_SDK });

    expect(popup.visibleViews()).toEqual(["idle"]);
  });

  it("renders a page-authored version as text, never as markup", async () => {
    await startWith({ ...OLD_SDK, version: "<img src=x onerror=alert(1)>" });

    expect(popup.el("reason-title").querySelector("img")).toBeNull();
    expect(reason().title).toContain("<img src=x onerror=alert(1)>");
  });

  // --- After Enable: the hook's failure codes ---

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

  it("names its own CDN host, never a host the page reported", async () => {
    await enablePending();

    await activationFailed({
      code: "csp-blocked",
      host: "evil.example",
      error: "Allow https://evil.example in script-src",
    });

    expect(popup.errorMsg.textContent).toContain("https://cdn.jsdelivr.net");
    expect(document.documentElement.outerHTML).not.toContain("evil.example");
  });

  it("falls back to the reported reason when the failure carries no code", async () => {
    await enablePending();

    await activationFailed({ error: "The editor could not be enabled." });

    expect(popup.errorMsg.textContent).toBe("The editor could not be enabled.");
  });

  it("stays quiet about a load failure outside an enable", async () => {
    await startWith(CURRENT_SDK);

    await activationFailed({ code: "timeout" });

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  // The hook's 10 s limit sits inside the popup's 15 s budget, so the user
  // reads the hook's reason. If either number moves past the other, the
  // generic text wins and this test goes red.
  it("shows the hook's timeout reason when the load outlasts the hook, not the generic one", async () => {
    await enablePending();

    await vi.advanceTimersByTimeAsync(HOOK_TIMEOUT_MS);
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
    await activate({ ...CURRENT_SDK, editorLoaded: true, editorVersion: "0.5.2" });

    expect(popup.visibleViews()).toEqual(["active"]);
    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.5.1 · editor v0.5.2");
  });

  it("shows only the SDK version for an editor that reports none", async () => {
    await activate({ ...CURRENT_SDK, editorLoaded: true });

    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.5.1");
  });

  it("renders a page-authored editor version as text, never as markup", async () => {
    await activate({ ...CURRENT_SDK, editorLoaded: true, editorVersion: "<b>9</b>" });

    expect(popup.versionLine.querySelector("b")).toBeNull();
    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.5.1 · editor v<b>9</b>");
  });

  it("keeps the active view when the version cannot be asked for", async () => {
    await enablePending();
    popup.onContentScript("GET_STATUS", undefined);

    await popup.fromServiceWorker({
      type: "SESSION_STATE_CHANGED",
      payload: { tabId: TAB_ID, active: true, pending: false },
    });

    expect(popup.visibleViews()).toEqual(["active"]);
    expect(popup.versionLine.textContent).toBe("Comvi i18n v0.5.1");
  });
});
