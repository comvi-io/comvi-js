import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWindow, recordEvents, recordJsonEvents, type PageWindow } from "./harness";

const PROXY_TIMEOUT_MS = 30_000;

interface TransportInit {
  method?: string;
  body?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

type Transport = (path: string, init?: TransportInit) => Promise<Response>;

interface EditorFake {
  isActive?: () => boolean;
  activate?: (options: { transport: Transport; apiBaseUrl?: string }) => unknown;
  deactivate?: () => void;
}

describe("MAIN-world detector editor lifecycle", () => {
  let page: PageWindow;
  let activateOptions: { transport: Transport; apiBaseUrl?: string } | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "i18n" } }];
    activateOptions = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function installEditor(editor: EditorFake): void {
    page.ComviInContextEditor = editor;
  }

  /** An editor runtime that activates successfully and hands back the transport. */
  function workingEditor(
    result: unknown = { instanceId: "editor-1", collectContext: false },
  ): void {
    installEditor({
      isActive: () => false,
      activate: (options) => {
        activateOptions = options;
        return result;
      },
    });
  }

  function activate(detail?: unknown): void {
    page.dispatchEvent(new CustomEvent("comvi-extension:activate", { detail }));
  }

  it("reports Comvi as undetected before the editor is ever consulted", async () => {
    page.__COMVI__ = undefined;
    workingEditor();
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: false, error: "Comvi i18n not detected" }]);
    expect(activateOptions).toBeUndefined();
  });

  it("reports a missing editor runtime", async () => {
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: false, error: "Editor runtime is not loaded" }]);
  });

  it("passes the base URL from a JSON activation command to the editor", async () => {
    workingEditor();
    await injectDetector();

    activate(JSON.stringify({ apiBaseUrl: "https://api.comvi.io" }));

    expect(activateOptions?.apiBaseUrl).toBe("https://api.comvi.io");
  });

  it.each([
    ["a malformed detail", "{not json"],
    ["a non-string base URL", { apiBaseUrl: 42 }],
    ["no detail at all", undefined],
  ])("activates without a base URL given %s", async (_label, detail) => {
    workingEditor();
    await injectDetector();

    activate(detail);

    expect(activateOptions).toBeDefined();
    expect(activateOptions?.apiBaseUrl).toBeUndefined();
  });

  it("reports the effective collectContext the editor derived", async () => {
    workingEditor({ instanceId: "editor-1", collectContext: true });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: true, instanceId: "editor-1", collectContext: true }]);
  });

  it("reports an editor that activated nothing as a failure", async () => {
    workingEditor(null);
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: false, instanceId: undefined, collectContext: false }]);
  });

  it("reports the reason an editor refused to activate", async () => {
    installEditor({
      isActive: () => false,
      activate: () => {
        throw new Error("no project selected");
      },
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: false, error: "no project selected" }]);
  });

  it("reports a generic reason when the editor throws something unreadable", async () => {
    installEditor({
      isActive: () => false,
      activate: () => {
        throw "kaboom";
      },
    });
    const results = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    activate({ apiBaseUrl: "https://api.comvi.io" });

    expect(results).toEqual([{ success: false, error: "Failed to activate editor" }]);
  });

  it("deactivates an active editor and acknowledges it", async () => {
    let deactivations = 0;
    installEditor({
      isActive: () => true,
      deactivate: () => {
        deactivations += 1;
      },
    });
    const results = recordEvents(page, "comvi-extension:deactivated");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    expect(deactivations).toBe(1);
    expect(results).toEqual([{ success: true }]);
  });

  it("refuses to deactivate an editor that is not active", async () => {
    installEditor({ isActive: () => false, deactivate: () => expect.unreachable() });
    const results = recordEvents(page, "comvi-extension:deactivated");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    expect(results).toEqual([{ success: false, error: "Editor not active" }]);
  });

  it("refuses to deactivate an editor runtime that exposes no isActive hook", async () => {
    installEditor({});
    const results = recordEvents(page, "comvi-extension:deactivated");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    expect(results).toEqual([{ success: false, error: "Editor not active" }]);
  });

  it("refuses to deactivate when no editor runtime is loaded", async () => {
    const results = recordEvents(page, "comvi-extension:deactivated");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("comvi-extension:deactivate"));

    expect(results).toEqual([{ success: false, error: "Editor not active" }]);
  });
});

describe("MAIN-world detector proxy transport", () => {
  let page: PageWindow;
  let transport: Transport;
  let requests: unknown[];
  let aborts: unknown[];

  beforeEach(async () => {
    vi.useFakeTimers();
    page = createPageWindow();
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "i18n" } }];
    let captured: Transport | undefined;
    page.ComviInContextEditor = {
      isActive: () => false,
      activate: (options: { transport: Transport }) => {
        captured = options.transport;
        return { instanceId: "editor-1" };
      },
    };
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");

    requests = recordJsonEvents(page, "comvi-extension:api-request");
    aborts = recordJsonEvents(page, "comvi-extension:api-abort");
    page.dispatchEvent(
      new CustomEvent("comvi-extension:activate", {
        detail: { apiBaseUrl: "https://api.comvi.io" },
      }),
    );
    if (!captured) throw new Error("the editor was activated without a transport");
    transport = captured;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function requestId(index = 0): string {
    return (requests[index] as { id: string }).id;
  }

  function respond(detail: unknown): void {
    page.dispatchEvent(
      new CustomEvent("comvi-extension:api-response", { detail: JSON.stringify(detail) }),
    );
  }

  it("sends the request over the page bridge with its full shape", async () => {
    const pending = transport("/v1/translations", {
      method: "POST",
      body: '{"key":"a"}',
      keepalive: true,
    });
    respond({ id: requestId(), ok: true, status: 200, statusText: "OK", body: "{}" });
    await pending;

    expect(requests).toEqual([
      {
        id: requestId(),
        path: "/v1/translations",
        method: "POST",
        body: '{"key":"a"}',
        keepalive: true,
      },
    ]);
  });

  it("marks a keepalive that is not exactly true as no keepalive", async () => {
    const pending = transport("/v1/telemetry", {
      keepalive: "yes" as unknown as boolean,
    });
    respond({ id: requestId(), ok: true, status: 200, statusText: "OK", body: "{}" });
    await pending;

    expect(requests[0]).toMatchObject({ keepalive: false });
  });

  it("resolves with the proxied response", async () => {
    const pending = transport("/v1/project");

    respond({
      id: requestId(),
      ok: true,
      status: 201,
      statusText: "Created",
      body: '{"id":"p1"}',
    });
    const response = await pending;

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.text()).toBe('{"id":"p1"}');
  });

  it("drops a status text the extension did not send as a string", async () => {
    const pending = transport("/v1/project");

    respond({ id: requestId(), ok: true, status: 200, statusText: 7, body: "{}" });
    const response = await pending;

    expect(response.statusText).toBe("");
  });

  it.each([204, 205, 304])("resolves a %i response with no body", async (status) => {
    const pending = transport("/v1/project");

    respond({ id: requestId(), ok: true, status, statusText: "", body: "ignored" });
    const response = await pending;

    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });

  it("resolves an empty body the extension reported as absent", async () => {
    const pending = transport("/v1/project");

    respond({ id: requestId(), ok: true, status: 200, statusText: "OK" });
    const response = await pending;

    expect(await response.text()).toBe("");
  });

  it("rejects with the network error the extension reported", async () => {
    const pending = transport("/v1/project");
    const rejection = expect(pending).rejects.toThrow("Extension was reloaded");

    respond({
      id: requestId(),
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      networkError: "Extension was reloaded",
    });

    await rejection;
  });

  it("rejects a response carrying a network error even when it also carries a status", async () => {
    const pending = transport("/v1/project");
    const rejection = expect(pending).rejects.toThrow("upstream unreachable");

    respond({
      id: requestId(),
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      body: "",
      networkError: "upstream unreachable",
    });

    await rejection;
  });

  it("rejects a response the extension gave no usable status", async () => {
    const pending = transport("/v1/project");
    const rejection = expect(pending).rejects.toThrow("Comvi extension API request failed");

    respond({ id: requestId(), ok: false, status: 0, statusText: "", body: "" });

    await rejection;
  });

  it("rejects a response whose status is not a number", async () => {
    const pending = transport("/v1/project");
    const rejection = expect(pending).rejects.toThrow("Comvi extension API request failed");

    respond({ id: requestId(), ok: true, status: "200", statusText: "OK", body: "{}" });

    await rejection;
  });

  it("answers only the request a response is addressed to", async () => {
    const first = transport("/v1/a");
    const second = transport("/v1/b");
    let firstSettled = false;
    const watchFirst = first.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      },
    );

    respond({ id: requestId(1), ok: true, status: 200, statusText: "OK", body: "b" });
    const response = await second;
    await Promise.race([watchFirst, Promise.resolve()]);

    expect(await response.text()).toBe("b");
    expect(firstSettled).toBe(false);
  });

  it.each([
    ["unparsable", "{not json"],
    ["null", "null"],
    ["addressed to an unknown request", JSON.stringify({ id: "someone-else", status: 200 })],
  ])("ignores a %s response and stays open for the real one", async (_label, detail) => {
    const pending = transport("/v1/project");

    page.dispatchEvent(new CustomEvent("comvi-extension:api-response", { detail }));
    respond({ id: requestId(), ok: true, status: 200, statusText: "OK", body: "late" });
    const response = await pending;

    expect(await response.text()).toBe("late");
  });

  it("rejects an already-aborted request as an abort, without asking the extension", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await transport("/v1/project", { signal: controller.signal }).catch(
      (reason: unknown) => reason,
    );

    expect((error as Error).name).toBe("AbortError");
    expect((error as Error).message).toBe("The operation was aborted.");
    expect(requests).toEqual([]);
  });

  it("tells the extension to abort when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = transport("/v1/project", { signal: controller.signal });
    const settled = pending.catch((reason: unknown) => reason);

    controller.abort();

    const error = await settled;
    expect((error as Error).name).toBe("AbortError");
    expect((error as Error).message).toBe("The operation was aborted.");
    expect(aborts).toEqual([{ id: requestId() }]);
  });

  it("stops its own timeout once the caller aborted", async () => {
    const controller = new AbortController();
    const pending = transport("/v1/project", { signal: controller.signal });
    const settled = pending.catch((reason: unknown) => reason);
    controller.abort();
    await settled;

    await vi.advanceTimersByTimeAsync(PROXY_TIMEOUT_MS);

    expect(aborts).toHaveLength(1);
  });

  it("accepts a response the bridge delivered as an object rather than JSON text", async () => {
    const pending = transport("/v1/project");

    page.dispatchEvent(
      new CustomEvent("comvi-extension:api-response", {
        detail: { id: requestId(), ok: true, status: 200, statusText: "OK", body: "plain" },
      }),
    );
    const response = await pending;

    expect(await response.text()).toBe("plain");
  });

  it("tells the extension to abort when the request times out", async () => {
    const pending = transport("/v1/project");
    const rejection = expect(pending).rejects.toThrow("Comvi extension API request timed out");

    await vi.advanceTimersByTimeAsync(PROXY_TIMEOUT_MS);

    await rejection;
    expect(aborts).toEqual([{ id: requestId() }]);
  });

  it("stops listening to the caller's signal once the request timed out", async () => {
    const controller = new AbortController();
    const pending = transport("/v1/project", { signal: controller.signal });
    const rejection = expect(pending).rejects.toThrow("Comvi extension API request timed out");
    await vi.advanceTimersByTimeAsync(PROXY_TIMEOUT_MS);
    await rejection;

    controller.abort();

    expect(aborts).toHaveLength(1);
  });

  it("cancels the timeout once the response has arrived", async () => {
    const pending = transport("/v1/project");
    respond({ id: requestId(), ok: true, status: 200, statusText: "OK", body: "{}" });
    await pending;

    await vi.advanceTimersByTimeAsync(PROXY_TIMEOUT_MS);

    expect(aborts).toEqual([]);
  });

  it("releases its page listener once the request settles", async () => {
    const pending = transport("/v1/project");
    expect(page.listenerCount("comvi-extension:api-response")).toBe(1);

    respond({ id: requestId(), ok: true, status: 200, statusText: "OK", body: "{}" });
    await pending;

    expect(page.listenerCount("comvi-extension:api-response")).toBe(0);
  });
});
