import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getNavGen = vi.fn();
const deleteSession = vi.fn();
const getTabState = vi.fn();

vi.mock("../state", () => ({
  getSession,
  getNavGen,
  deleteSession,
  getTabState,
  tabLockKey: (tabId: number) => `tab:${tabId}`,
  withLock: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("../badge", () => ({ renderBadge: vi.fn() }));

const { clearTabLimits, handleProxyRequest } = await import("../proxy-handler");
const { notifyProxySessionTransition } = await import("../proxy-work");

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

beforeEach(() => {
  clearTabLimits(TAB_ID);
  vi.restoreAllMocks();
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

    await vi.waitFor(() => expect(getSession).toHaveBeenCalled());
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
    let cancelled = false;
    const chunk = new Uint8Array(6_000_000);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(chunk);
          if (pulls === 3) controller.close();
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const result = await handleProxyRequest(request(), sender());

    expect(result.networkError).toBe("Response too large");
    expect(cancelled).toBe(true);
  });

  it("counts UTF-8 bytes rather than decoded characters", async () => {
    const encoded = new TextEncoder().encode("😀".repeat(2_600_000));
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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
    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(init?.body).toBeUndefined();
  });
});
