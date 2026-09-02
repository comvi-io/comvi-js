import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getNavGen = vi.fn();
const deleteSession = vi.fn();
const getTabState = vi.fn();

/** Lets a test land a revocation in the gap between work registration and the fetch. */
const seam = vi.hoisted(() => ({ afterSetupLock: undefined as (() => void) | undefined }));

vi.mock("../state", () => ({
  getSession,
  getNavGen,
  deleteSession,
  getTabState,
  tabLockKey: (tabId: number) => `tab:${tabId}`,
  withLock: async (_key: string, fn: () => Promise<unknown>) => {
    const result = await fn();
    seam.afterSetupLock?.();
    return result;
  },
}));
const renderBadge = vi.fn();
vi.mock("../badge", () => ({ renderBadge }));

const { clearTabLimits, handleProxyRequest, abortProxyRequest } = await import("../proxy-handler");
const {
  abortTabProxyWork,
  beginTabProxyRevocation,
  endTabProxyRevocation,
  notifyProxySessionTransition,
  reserveProxyWork,
} = await import("../proxy-work");

const TAB_ID = 9;
const ORIGIN = "https://app.example.com";

function sender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    tab: { id: TAB_ID } as chrome.tabs.Tab,
    frameId: 0,
    origin: ORIGIN,
    documentId: "doc-1",
    ...overrides,
  } as chrome.runtime.MessageSender;
}

function request(id = "request-1") {
  return { id, path: "/v1/project/locales", method: "GET" };
}

/** `vi.waitFor` defaults to a 50 ms retry interval; every wait here settles within a tick. */
const POLL = { interval: 1 };

/** A pending session record the handler will park a request on. */
function pendingSession() {
  return {
    status: "pending",
    origin: ORIGIN,
    apiKey: "cmv_test",
    collectContext: false,
    nonce: "nonce",
    navGen: 0,
    expiresAt: Date.now() + 30_000,
  };
}

beforeEach(() => {
  seam.afterSetupLock = undefined;
  // Standalone `vi.fn()` mocks keep their call history through `restoreMocks`.
  for (const mock of [getSession, getNavGen, deleteSession, getTabState, renderBadge]) {
    mock.mockClear();
  }
  clearTabLimits(TAB_ID);
  getSession.mockResolvedValue({
    status: "active",
    origin: ORIGIN,
    apiKey: "cmv_test",
    collectContext: false,
    nonce: "nonce",
    navGen: 0,
    expiresAt: 0,
    documentId: "doc-1",
  });
  getNavGen.mockResolvedValue(0);
  deleteSession.mockResolvedValue(undefined);
  getTabState.mockResolvedValue(undefined);
});

describe("proxy sender document binding", () => {
  it("fails closed when an active session has a documentId but the sender does not", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await handleProxyRequest(request(), sender({ documentId: undefined }));

    expect(result.networkError).toBe("Stale document");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a different document before network access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await handleProxyRequest(request(), sender({ documentId: "doc-2" }));

    expect(result.networkError).toBe("Stale document");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pending activation ordering", () => {
  it("holds an activation-time request until the session is promoted", async () => {
    let status: "pending" | "active" = "pending";
    getSession.mockImplementation(async () => ({
      status,
      origin: ORIGIN,
      apiKey: "cmv_test",
      collectContext: false,
      nonce: "nonce",
      navGen: 0,
      expiresAt: status === "pending" ? Date.now() + 30_000 : 0,
      ...(status === "active" ? { documentId: "doc-1" } : {}),
    }));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"namespaces":{}}', { status: 200 }));

    const response = handleProxyRequest(
      { id: "activation-refresh", path: "/v1/translations?locales=en&namespaces=default" },
      sender(),
    );

    await vi.waitFor(() => expect(getSession).toHaveBeenCalled(), POLL);
    expect(fetchMock).not.toHaveBeenCalled();

    status = "active";
    notifyProxySessionTransition(TAB_ID);

    await expect(response).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("proxy response limits", () => {
  it("stops reading an unknown-length response as soon as the byte cap is exceeded", async () => {
    let pulls = 0;
    let cancelReason: unknown;
    const chunk = new Uint8Array(6_000_000);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(chunk);
          if (pulls === 3) controller.close();
        },
        cancel(reason) {
          cancelReason = reason;
        },
      }),
      { status: 200 },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Response too large");
    expect(cancelReason).toBe("Response too large");
  });

  it("counts UTF-8 bytes rather than decoded characters", async () => {
    const encoded = new TextEncoder().encode("😀".repeat(2_600_000));
    // Guards the fixture, not the code: if this ever drops under the cap the test stops proving anything.
    expect(encoded.byteLength).toBeGreaterThan(10_000_000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoded);
            controller.close();
          },
        }),
      ),
    );

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Response too large");
  });
});

describe("proxy request ids", () => {
  it("rejects a duplicate in-flight request id without replacing its abort controller", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = handleProxyRequest(request("same-id"), sender());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), POLL);

    const duplicate = await handleProxyRequest(request("same-id"), sender());
    expect(duplicate.networkError).toBe("Duplicate request id");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response("ok", { status: 200 }));
    await expect(first).resolves.toMatchObject({ ok: true, body: "ok" });
  });
});

describe("proxy request headers", () => {
  it("does not declare JSON for a bodyless DELETE", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const result = await handleProxyRequest(
      { id: "delete-1", path: "/v1/keys/common/system.crud", method: "DELETE" },
      sender(),
    );

    expect(result.status).toBe(204);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(init?.body).toBeUndefined();
  });
});

describe("sender identity", () => {
  it("refuses a request that did not come from a tab", async () => {
    const result = await handleProxyRequest(request(), sender({ tab: undefined }));

    expect(result).toEqual({
      id: "request-1",
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      networkError: "Proxy requests must come from a tab",
    });
  });

  it("refuses a request from a subframe", async () => {
    const result = await handleProxyRequest(request(), sender({ frameId: 2 }));

    expect(result.networkError).toBe("Proxy requests are only allowed from the top frame");
  });
});

describe("request id validation", () => {
  it("refuses a payload that carries no id", async () => {
    const result = await handleProxyRequest({ path: "/v1/project/locales" }, sender());

    expect(result).toMatchObject({ id: "", networkError: "Missing or invalid request id" });
  });

  it("refuses a null payload", async () => {
    const result = await handleProxyRequest(null, sender());

    expect(result).toMatchObject({ id: "", networkError: "Missing or invalid request id" });
  });

  it("refuses an id that is not a string", async () => {
    const result = await handleProxyRequest({ id: 7, path: "/v1/project/locales" }, sender());

    expect(result).toMatchObject({ id: "", networkError: "Missing or invalid request id" });
  });

  it("refuses an id longer than 128 characters", async () => {
    const result = await handleProxyRequest(request("i".repeat(129)), sender());

    expect(result.networkError).toBe("Missing or invalid request id");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("accepts an id of exactly 128 characters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await handleProxyRequest(request("i".repeat(128)), sender());

    expect(result.ok).toBe(true);
  });
});

describe("authority re-checks", () => {
  it("refuses a request while the tab is being revoked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    beginTabProxyRevocation(TAB_ID);

    const result = await handleProxyRequest(request(), sender());
    endTabProxyRevocation(TAB_ID);

    expect(result.networkError).toBe("No active editor session for this tab");
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a pending session whose tab has navigated", async () => {
    getSession.mockResolvedValue(pendingSession());
    getNavGen.mockResolvedValue(1);

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Session invalidated by navigation");
  });

  it("drops an active session whose tab has navigated", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    getNavGen.mockResolvedValue(3);
    getTabState.mockResolvedValue({ comviDetected: true });

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Session invalidated by navigation");
    expect(deleteSession).toHaveBeenCalledWith(TAB_ID);
    expect(renderBadge).toHaveBeenCalledWith(TAB_ID, true, false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reach the network when a revocation lands after registration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    seam.afterSetupLock = () => abortTabProxyWork(TAB_ID);

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Request aborted");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("waiting out an activation", () => {
  it("refuses rather than waiting twice when the session is still pending", async () => {
    getSession.mockResolvedValue(pendingSession());
    seam.afterSetupLock = () => notifyProxySessionTransition(TAB_ID);

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("No active editor session for this tab");
  });

  it("reports an aborted request rather than retrying it", async () => {
    getSession.mockResolvedValue(pendingSession());

    let settled = false;
    const inFlight = handleProxyRequest(request("wait-abort"), sender()).then((response) => {
      settled = true;
      return response;
    });

    // The request parks a few awaits deep; retry the abort until it lands.
    await vi.waitFor(async () => {
      abortProxyRequest({ id: "wait-abort" }, sender());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(true);
    }, POLL);

    await expect(inFlight).resolves.toMatchObject({ networkError: "Request aborted" });
  });

  it("refuses a request id that is already waiting for the same activation", async () => {
    getSession.mockResolvedValue(pendingSession());

    const first = handleProxyRequest(request("wait-dup"), sender());
    await vi.waitFor(() => expect(getSession).toHaveBeenCalled(), POLL);
    const second = await handleProxyRequest(request("wait-dup"), sender());

    expect(second.networkError).toBe("Duplicate request id");
    abortTabProxyWork(TAB_ID);
    await first;
  });
});

describe("outgoing request shape", () => {
  it("declares JSON for a request that carries a body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await handleProxyRequest(
      {
        id: "put-1",
        path: "/v1/keys",
        method: "PUT",
        body: JSON.stringify({
          key: "system.crud",
          namespace: "common",
          isPlural: false,
          translations: { en: { value: "Save", status: "translated" } },
        }),
      },
      sender(),
    );

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer cmv_test");
  });

  it("gives up on a request the API never answers", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );

    const inFlight = handleProxyRequest(request("slow"), sender());
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(inFlight).resolves.toMatchObject({ networkError: "Request aborted" });
    vi.useRealTimers();
  });

  it("cancels the request deadline once the response arrived", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await handleProxyRequest(request(), sender());

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("frees the request id once the request has completed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await handleProxyRequest(request("reused"), sender());
    const second = await handleProxyRequest(request("reused"), sender());

    expect(second.ok).toBe(true);
  });

  it("reports a network failure with the reason it failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await handleProxyRequest(request(), sender());

    expect(result).toEqual({
      id: "request-1",
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      networkError: "Failed to fetch",
    });
  });
});

describe("response body limits", () => {
  it("refuses a response that declares more than the byte cap", async () => {
    let aborted = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Response("small", {
        status: 200,
        headers: { "content-length": "10000001" },
      });
    });

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Response too large");
    expect(aborted).toBe(true);
  });

  it("accepts a response that declares exactly the byte cap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("small", { status: 200, headers: { "content-length": "10000000" } }),
    );

    const result = await handleProxyRequest(request(), sender());

    expect(result).toMatchObject({ ok: true, body: "small" });
  });

  it("reads a body of exactly the byte cap", async () => {
    const payload = new Uint8Array(10_000_000).fill(97);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const result = await handleProxyRequest(request(), sender());

    expect(result.ok).toBe(true);
    expect(result.body).toHaveLength(10_000_000);
  });

  it("returns an empty body for a response that has none", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const result = await handleProxyRequest(request(), sender());

    expect(result.body).toBe("");
  });

  it("joins a multi-byte character split across two chunks", async () => {
    const encoded = new TextEncoder().encode("héllo");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoded.slice(0, 2));
            controller.enqueue(encoded.slice(2));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const result = await handleProxyRequest(request(), sender());

    expect(result.body).toBe("héllo");
  });

  it("releases the response stream when it is done reading", async () => {
    const response = new Response("payload", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await handleProxyRequest(request(), sender());

    expect(() => response.body?.getReader()).not.toThrow();
  });

  // Only the cap check itself may abort: it needs both the RangeError type and its message.
  it.each([
    ["a network failure that merely names the size limit", new TypeError("Response too large")],
    ["a stream that failed for another reason", new RangeError("chunk decoding failed")],
  ])("does not abort %s", async (_label, failure) => {
    let aborted = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      throw failure;
    });

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe(failure.message);
    expect(aborted).toBe(false);
  });
});

describe("tab limit clearing", () => {
  it("aborts the work registered for a tab", () => {
    const reserved = reserveProxyWork(TAB_ID, "pending-work");
    if (!reserved.ok) throw new Error(reserved.error);

    clearTabLimits(TAB_ID);

    expect(reserved.reservation.controller.signal.aborted).toBe(true);
  });
});
