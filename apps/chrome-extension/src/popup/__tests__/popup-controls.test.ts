// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, type PopupHarness } from "./harness";

const PAGE_URL = "https://app.example.com/projects/1";
const PAGE_ORIGIN = "https://app.example.com";
const TAB_ID = 42;

/** Exactly one state panel is ever visible, and a running operation freezes the controls. */
describe("popup controls", () => {
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
    popup.onServiceWorker("GET_SESSION_STATUS", { active: true, pending: false });
    await popup.start();
  };

  /** Begin an enable that never completes, so the popup stays mid-operation. */
  const startEnabling = async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", new Promise(() => {}));
    popup.apiKeyInput.value = "sk-live-key";
    popup.enableBtn.click();
    await popup.flush();
  };

  // --- View exclusivity ---

  it("lays the loading panel out as a row", async () => {
    popup.tabsQuery.mockImplementationOnce(() => new Promise(() => {}));

    await popup.start();

    expect(popup.el("state-loading").classList.contains("flex")).toBe(true);
  });

  it("lays the idle panel out as a flex column", async () => {
    await startIdle();

    expect(popup.el("state-idle").classList.contains("flex")).toBe(true);
  });

  it("lays the active panel out as a flex column", async () => {
    await startActive();

    expect(popup.el("state-active").classList.contains("flex")).toBe(true);
  });

  it("leaves the not-detected panel as plain block text", async () => {
    popup.setActiveTab(null);

    await popup.start();

    expect(popup.el("state-not-detected").classList.contains("flex")).toBe(false);
  });

  it("hides every panel other than the visible one", async () => {
    await startActive();

    expect(popup.el("state-loading").classList.contains("hidden")).toBe(true);
    expect(popup.el("state-not-detected").classList.contains("hidden")).toBe(true);
    expect(popup.el("state-idle").classList.contains("hidden")).toBe(true);
  });

  // --- API key field ---

  it("masks the API key field by default", async () => {
    await startIdle();

    expect(popup.apiKeyInput.type).toBe("password");
    expect(popup.toggleKeyBtn.getAttribute("aria-label")).toBe("Show API key");
  });

  it("reveals the API key when the eye button is clicked", async () => {
    await startIdle();

    popup.toggleKeyBtn.click();

    expect(popup.apiKeyInput.type).toBe("text");
    expect(popup.toggleKeyBtn.getAttribute("aria-label")).toBe("Hide API key");
  });

  it("swaps the eye icons when the key is revealed", async () => {
    await startIdle();

    popup.toggleKeyBtn.click();

    expect(popup.keyIconShow.classList.contains("hidden")).toBe(true);
    expect(popup.keyIconHide.classList.contains("hidden")).toBe(false);
  });

  it("masks the API key again on a second click", async () => {
    await startIdle();

    popup.toggleKeyBtn.click();
    popup.toggleKeyBtn.click();

    expect(popup.apiKeyInput.type).toBe("password");
    expect(popup.keyIconShow.classList.contains("hidden")).toBe(false);
    expect(popup.keyIconHide.classList.contains("hidden")).toBe(true);
    expect(popup.toggleKeyBtn.getAttribute("aria-label")).toBe("Show API key");
  });

  // --- Errors ---

  it("shows the error text when an action fails", async () => {
    await startIdle();

    popup.enableBtn.click();
    await popup.flush();

    expect(popup.errorMsg.textContent).toBe("Please enter an API key");
    expect(popup.errorMsg.classList.contains("hidden")).toBe(false);
  });

  it("clears the error as soon as the user edits the key", async () => {
    await startIdle();
    popup.enableBtn.click();
    await popup.flush();

    popup.apiKeyInput.value = "sk-live-key";
    popup.apiKeyInput.dispatchEvent(new Event("input"));

    expect(popup.errorMsg.textContent).toBe("");
    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  it("starts with no error visible", async () => {
    await startIdle();

    expect(popup.errorMsg.classList.contains("hidden")).toBe(true);
  });

  // --- Operation locking ---

  it("disables every control while an operation runs", async () => {
    await startEnabling();

    expect(popup.enableBtn.disabled).toBe(true);
    expect(popup.disableBtn.disabled).toBe(true);
    expect(popup.apiKeyInput.disabled).toBe(true);
    expect(popup.toggleKeyBtn.disabled).toBe(true);
    expect(popup.forgetKeyBtn.disabled).toBe(true);
  });

  it("leaves every control usable when nothing is running", async () => {
    await startIdle();

    expect(popup.enableBtn.disabled).toBe(false);
    expect(popup.disableBtn.disabled).toBe(false);
    expect(popup.apiKeyInput.disabled).toBe(false);
    expect(popup.toggleKeyBtn.disabled).toBe(false);
    expect(popup.forgetKeyBtn.disabled).toBe(false);
  });

  it("labels the enable button as busy while enabling", async () => {
    await startEnabling();

    expect(popup.enableBtn.textContent).toBe("Enabling…");
  });

  it("shows the enabling progress line", async () => {
    await startEnabling();

    expect(popup.operationStatus.classList.contains("hidden")).toBe(false);
    expect(popup.operationStatus.classList.contains("flex")).toBe(true);
    expect(popup.operationStatusText.textContent).toBe("Checking key…");
  });

  it("labels the disable button as busy while disabling", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", new Promise(() => {}));

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.disableBtn.textContent).toBe("Disabling…");
  });

  it("leaves the progress line empty while disabling", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", new Promise(() => {}));

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.operationStatusText.textContent).toBe("");
  });

  it("keeps the progress line hidden while disabling", async () => {
    await startActive();
    popup.onServiceWorker("END_SESSION", new Promise(() => {}));

    popup.disableBtn.click();
    await popup.flush();

    expect(popup.operationStatus.classList.contains("hidden")).toBe(true);
    expect(popup.operationStatus.classList.contains("flex")).toBe(false);
  });

  it("shows the progress line while forgetting a saved key", async () => {
    await popup.seedCredentials(PAGE_ORIGIN, "sk-saved-key");
    await startIdle();
    popup.onServiceWorker("FORGET_CREDENTIALS", new Promise(() => {}));

    popup.forgetKeyBtn.click();
    await popup.flush();

    expect(popup.operationStatus.classList.contains("hidden")).toBe(false);
    expect(popup.operationStatus.classList.contains("flex")).toBe(true);
    expect(popup.operationStatusText.textContent).toBe("Removing saved key…");
  });

  it("restores the button labels when an operation ends", async () => {
    await startIdle();
    popup.onServiceWorker("START_SESSION", { ok: false, error: "Invalid API key" });
    popup.apiKeyInput.value = "sk-live-key";

    popup.enableBtn.click();
    await popup.flush();

    expect(popup.enableBtn.textContent).toBe("Enable editor");
    expect(popup.disableBtn.textContent).toBe("Disable editor");
    expect(popup.operationStatus.classList.contains("hidden")).toBe(true);
  });

  it("hides the forget action until a saved key is known", async () => {
    await startIdle();

    expect(popup.forgetKeyBtn.classList.contains("hidden")).toBe(true);
  });
});
