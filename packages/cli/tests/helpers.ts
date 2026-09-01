import { promises as nodeFs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, vi } from "vitest";
import { TypegenError } from "../src/utils/errors";

/**
 * Captures the error a synchronous call throws so a test can assert on fields
 * (`code`, `cause`) that `expect(...).toThrow()` cannot reach. Fails the test
 * when nothing is thrown, so the "did not throw" case is never silent.
 */
export function thrownBy(fn: () => unknown): TypegenError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TypegenError);
    return error as TypegenError;
  }

  throw new Error("expected the call to throw, but it returned normally");
}

const tempDirs: string[] = [];

/** A fresh directory under the OS temp dir; remove them all in `afterEach`. */
export async function makeTempDir(prefix: string): Promise<string> {
  const dir = await nodeFs.mkdtemp(join(tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

export async function removeTempDirs(): Promise<void> {
  const dirs = tempDirs.splice(0, tempDirs.length);
  await Promise.all(dirs.map((dir) => nodeFs.rm(dir, { recursive: true, force: true })));
}

/**
 * The sentinel a stubbed `process.exit` throws in place of ending the process.
 */
export class ExitSignal extends Error {
  constructor(readonly exitCode: number) {
    super(`process.exit(${exitCode})`);
    this.name = "ExitSignal";
  }
}

export interface ProcessExitCapture {
  /** Every code passed to `process.exit`, in order. */
  readonly codes: number[];
}

/**
 * The real `process.exit` never returns, so the FIRST code is the one that
 * ships. Commands call `exit` from inside a `try`, and the sentinel unwinding
 * through their `catch` makes them exit again — re-throwing the memoized
 * instance keeps that second call from masking the code they exited with.
 */
export function stubProcessExit(): ProcessExitCapture {
  const codes: number[] = [];
  let signal: ExitSignal | undefined;

  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    const exitCode = typeof code === "number" ? code : 0;
    codes.push(exitCode);
    signal ??= new ExitSignal(exitCode);
    throw signal;
  }) as never);

  return { codes };
}

export interface ConsoleCapture {
  /** One entry per `console.log` call. */
  readonly log: string[];
  /** One entry per `console.error` call. */
  readonly error: string[];
  readonly stdout: string;
  readonly stderr: string;
}

export function captureConsole(): ConsoleCapture {
  const log: string[] = [];
  const error: string[] = [];

  vi.spyOn(console, "log").mockImplementation(
    (...args: unknown[]) => void log.push(args.join(" ")),
  );
  vi.spyOn(console, "error").mockImplementation(
    (...args: unknown[]) => void error.push(args.join(" ")),
  );

  return {
    log,
    error,
    get stdout() {
      return log.join("\n");
    },
    get stderr() {
      return error.join("\n");
    },
  };
}

export interface RouteResponse {
  status?: number;
  statusText?: string;
  body?: unknown;
}

/** Routes keyed by exact URL pathname, so a query string never affects matching. */
export type Routes = Record<string, RouteResponse>;

export interface RecordedRequest {
  url: string;
  init: RequestInit;
}

export interface FetchCapture {
  readonly requests: RecordedRequest[];
  /** Pathnames of every request made, in order. */
  paths(): string[];
  /** URL of the one request to `pathname`; throws when there is not exactly one. */
  urlFor(pathname: string): string;
  /** Parsed JSON body of the one request to `pathname`. */
  jsonBodyFor(pathname: string): Record<string, unknown>;
}

const unexpectedRequests: string[] = [];

/**
 * Replaces `fetch` with a router that answers by exact pathname. An unrouted URL
 * fails the test twice over: the request rejects, and
 * `assertNoUnexpectedRequests()` names it in `afterEach` even if the command
 * under test swallowed the rejection.
 */
export function stubFetch(routes: Routes): FetchCapture {
  const requests: RecordedRequest[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });

      const route = routes[new URL(url).pathname];
      if (!route) {
        unexpectedRequests.push(url);
        throw new Error(`unexpected request: ${url}`);
      }

      const status = route.status ?? 200;
      return {
        ok: status < 400,
        status,
        statusText: route.statusText ?? "OK",
        json: async () => route.body,
      } as Response;
    }),
  );

  function only(pathname: string): RecordedRequest {
    const matches = requests.filter((request) => new URL(request.url).pathname === pathname);
    if (matches.length !== 1) {
      throw new Error(
        `expected exactly one request to ${pathname}, got ${matches.length} of: ` +
          `${requests.map((request) => request.url).join(", ") || "(no requests)"}`,
      );
    }
    return matches[0];
  }

  return {
    requests,
    paths: () => requests.map((request) => new URL(request.url).pathname),
    urlFor: (pathname) => only(pathname).url,
    jsonBodyFor: (pathname) => JSON.parse(String(only(pathname).init.body)),
  };
}

export function assertNoUnexpectedRequests(): void {
  const unexpected = unexpectedRequests.splice(0, unexpectedRequests.length);

  expect(unexpected).toEqual([]);
}

export interface FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

/**
 * Replaces the lazily imported `eventsource` module. Callers must import
 * `ApiClient` dynamically afterwards for the mock to apply.
 */
export function mockEventSource(): { instances: FakeEventSource[] } {
  const instances: FakeEventSource[] = [];

  vi.doMock("eventsource", () => ({
    EventSource: class implements FakeEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        instances.push(this);
      }
      close() {}
    },
  }));

  return { instances };
}
