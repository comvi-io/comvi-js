/**
 * Session state machine: API key validation and opening a pending session.
 */
import { describe, expect, it, vi } from "vitest";
import { startSession } from "../sessions";
import { bumpAuthorityEpoch, bumpNavGen, getSession } from "../state";
import { getProxySessionTransitionGeneration } from "../proxy-work";
import { getAllCredentials } from "../../shared/storage";
import {
  TAB,
  ORIGIN,
  OTHER_ORIGIN,
  API_KEY,
  API,
  popupSender,
  pageSender,
  harness,
  fetchMock,
  apiValidates,
  payload,
  openPendingSession,
  onNthTabRead,
} from "./sessions.suite";

describe("API key validation", () => {
  it("sends the key as a bearer token to the canonical project route", async () => {
    await startSession(payload(), popupSender);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/v1/project`);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
  });

  it("falls back to the legacy deployment route when the canonical one is missing", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/v1/project")
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify({ id: 42 }), { status: 200 }),
    );

    const started = await startSession(payload(), popupSender);

    expect(started.ok).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/api/v1/api/project`);
  });

  it("reports an invalid key when the API rejects the credentials", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid API key",
    });
  });

  it("reports an invalid key when the API forbids the credentials", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 403 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Invalid API key",
    });
  });

  it("surfaces an unexpected API status", async () => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "API error: 500 Internal Server Error",
    });
  });

  it("reports a missing endpoint when neither project route exists", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Comvi API endpoint not found",
    });
  });

  it("reports an unreachable API", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "Could not reach the Comvi API. Check your connection.",
    });
  });

  it("gives up on an API that does not answer in time", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );

    const started = startSession(payload(), popupSender);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(started).resolves.toEqual({
      ok: false,
      error: "The Comvi API did not respond in time. Try again.",
    });
  });

  it("cancels the validation deadline once the API has answered", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));

    await startSession(payload(), popupSender);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("binds the session to a string project id", async () => {
    apiValidates("project-1");

    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({ projectId: "project-1" });
  });

  it("binds the session to a numeric project id", async () => {
    apiValidates(7);

    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({ projectId: 7 });
  });

  it("leaves the session unbound when the project id is neither string nor number", async () => {
    apiValidates(true);

    await openPendingSession();

    expect((await getSession(TAB))?.projectId).toBeUndefined();
  });

  it("accepts a validating response whose body is not JSON", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>ok</html>", { status: 200 }));

    await openPendingSession();

    expect((await getSession(TAB))?.projectId).toBeUndefined();
  });
});

describe("opening a session", () => {
  it("refuses a session request relayed by a content script", async () => {
    await expect(startSession(payload(), pageSender())).resolves.toEqual({
      ok: false,
      error: "Not allowed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a tab id that is not a number", { tabId: "5" }],
    ["a fractional tab id", { tabId: 5.5 }],
    ["an api key that is not a string", { apiKey: 123 }],
    ["an empty api key", { apiKey: "" }],
    ["an api key longer than 512 characters", { apiKey: "k".repeat(513) }],
    ["a popup lease that is not a string", { popupLeaseId: 42 }],
    ["a popup lease shorter than 16 characters", { popupLeaseId: "a".repeat(15) }],
    ["a popup lease longer than 128 characters", { popupLeaseId: "a".repeat(129) }],
  ])("refuses %s", async (_label, overrides) => {
    await expect(startSession(payload(overrides), popupSender)).resolves.toEqual({
      ok: false,
      error: "Malformed session request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an api key of exactly the maximum length", async () => {
    const started = await startSession(payload({ apiKey: "k".repeat(512) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("accepts a popup lease of exactly the minimum length", async () => {
    const started = await startSession(payload({ popupLeaseId: "a".repeat(16) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("accepts a popup lease of exactly the maximum length", async () => {
    const started = await startSession(payload({ popupLeaseId: "a".repeat(128) }), popupSender);

    expect(started.ok).toBe(true);
  });

  it("refuses a session for a popup lease that is no longer registered", async () => {
    await expect(startSession(payload(), popupSender, () => false)).resolves.toEqual({
      ok: false,
      error: "Malformed session request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an insecure origin", async () => {
    await expect(
      startSession(payload({ origin: "http://app.example.com" }), popupSender),
    ).resolves.toEqual({
      ok: false,
      error: "The editor can only be enabled on secure (https) pages",
    });
  });

  it("refuses a session for a tab that no longer exists", async () => {
    harness.chrome.tabs.get.mockRejectedValue(new Error(`No tab with id ${TAB}`));

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page changed. Close and reopen the popup.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a session for a tab that is showing another origin", async () => {
    harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page changed. Close and reopen the popup.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a session when the tab navigated while the key was validating", async () => {
    fetchMock.mockImplementation(async () => {
      await bumpNavGen(TAB);
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page navigated while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("refuses a session when the tab changed origin while the key was validating", async () => {
    fetchMock.mockImplementation(async () => {
      harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page navigated while validating. Try again.",
    });
  });

  it("refuses a session when a credential purge invalidated the validation", async () => {
    fetchMock.mockImplementation(async () => {
      await bumpAuthorityEpoch();
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
  });

  it("refuses a session when the tab navigates after the post-validation check", async () => {
    onNthTabRead(2, async () => {
      await bumpNavGen(TAB);
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("refuses a session when the tab changes origin after the post-validation check", async () => {
    onNthTabRead(2, async () => {
      harness.setTabUrl(TAB, `${OTHER_ORIGIN}/dashboard`);
    });

    await expect(startSession(payload(), popupSender)).resolves.toEqual({
      ok: false,
      error: "The page or popup changed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
  });

  it("removes the session when the popup closes while it is being persisted", async () => {
    let leaseChecks = 0;
    const isPopupLeaseActive = () => {
      leaseChecks += 1;
      return leaseChecks <= 2;
    };
    const generationBefore = getProxySessionTransitionGeneration(TAB);

    await expect(startSession(payload(), popupSender, isPopupLeaseActive)).resolves.toEqual({
      ok: false,
      error: "The popup closed while validating. Try again.",
    });
    await expect(getSession(TAB)).resolves.toBeUndefined();
    expect(getProxySessionTransitionGeneration(TAB)).toBeGreaterThan(generationBefore);
  });

  it("stores the validated credential for the origin", async () => {
    await openPendingSession();

    await expect(getAllCredentials()).resolves.toEqual({
      [ORIGIN]: { apiKey: API_KEY, validated: true },
    });
  });

  it("opens a pending session with no context-collection authority", async () => {
    await openPendingSession();

    await expect(getSession(TAB)).resolves.toMatchObject({
      status: "pending",
      origin: ORIGIN,
      collectContext: false,
    });
  });
});
