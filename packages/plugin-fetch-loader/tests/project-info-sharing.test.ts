/**
 * Concurrent callers share ONE project-info request. Who may cancel it is the
 * contract these pin: a caller that passed no signal can never be cancelled by
 * one that did, and the shared request is only aborted once nobody is left
 * waiting on it.
 */
import { describe, it, expect } from "vitest";
import { fetchProjectInfo } from "../src/index";
import { pendingTransport } from "./helpers/transport";

const BASE = "https://api.example.com";
const ABORT_MESSAGE = `[FetchLoader] Request aborted: ${BASE}/v1/project`;

const abortedSignal = () => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};

describe("fetchProjectInfo() request sharing", () => {
  it("serves a caller that arrives mid-flight from the same request", async () => {
    const transport = pendingTransport();

    const first = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: new AbortController().signal,
    });
    await transport.requested;
    const second = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: new AbortController().signal,
    });
    transport.resolve({ id: 5 });

    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 5 }, { id: 5 }]);
    expect(transport.urls).toEqual([`${BASE}/v1/project`]);
  });

  it("cancels the shared request once every joined caller has aborted", async () => {
    const transport = pendingTransport();
    const firstCaller = new AbortController();
    const secondCaller = new AbortController();

    const first = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: firstCaller.signal,
    });
    await transport.requested;
    const second = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: secondCaller.signal,
    });
    firstCaller.abort();
    secondCaller.abort();

    await expect(first).rejects.toThrow(ABORT_MESSAGE);
    await expect(second).rejects.toThrow(ABORT_MESSAGE);
    expect(transport.signals[0]?.aborted).toBe(true);
  });

  it("keeps the shared request running while another caller is still waiting", async () => {
    const transport = pendingTransport();
    const leaving = new AbortController();

    const abandoned = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: leaving.signal,
    });
    await transport.requested;
    const waiting = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: new AbortController().signal,
    });
    leaving.abort();

    await expect(abandoned).rejects.toThrow(ABORT_MESSAGE);
    transport.resolve({ id: 1 });
    await expect(waiting).resolves.toEqual({ id: 1 });
  });

  it("never cancels a request a caller without a signal is waiting on", async () => {
    const transport = pendingTransport();
    const leaving = new AbortController();

    const uncancellable = fetchProjectInfo("key", BASE, 5000, transport.fetchFn);
    await transport.requested;
    const abandoned = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: leaving.signal,
    });
    leaving.abort();

    await expect(abandoned).rejects.toThrow(ABORT_MESSAGE);
    transport.resolve({ id: 1 });
    await expect(uncancellable).resolves.toEqual({ id: 1 });
  });

  it("rejects a caller that arrives with an already-aborted signal, leaving the others alone", async () => {
    const transport = pendingTransport();

    const waiting = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: new AbortController().signal,
    });
    await transport.requested;
    const joiner = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: abortedSignal(),
    });

    await expect(joiner).rejects.toThrow(ABORT_MESSAGE);
    transport.resolve({ id: 1 });
    await expect(waiting).resolves.toEqual({ id: 1 });
  });

  it("rejects an already-aborted caller without disturbing a caller that passed no signal", async () => {
    const transport = pendingTransport();

    const uncancellable = fetchProjectInfo("key", BASE, 5000, transport.fetchFn);
    await transport.requested;
    const joiner = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: abortedSignal(),
    });

    await expect(joiner).rejects.toThrow(ABORT_MESSAGE);
    transport.resolve({ id: 1 });
    await expect(uncancellable).resolves.toEqual({ id: 1 });
  });

  it("cancels the request it just started when the caller's signal is already aborted", async () => {
    // The caller is rejected before it can observe the shared request, so an
    // aborting transport is left hanging rather than rejecting into no one.
    const transport = pendingTransport({ rejectOnAbort: false });

    const request = fetchProjectInfo("key", BASE, 5000, transport.fetchFn, undefined, {
      signal: abortedSignal(),
    });

    await expect(request).rejects.toThrow(ABORT_MESSAGE);
    expect(transport.signals[0]?.aborted).toBe(true);
  });
});
