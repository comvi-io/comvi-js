/**
 * Drives the built `bin/comvi.js` against a real platform API started by
 * `scripts/cli-e2e.mjs` (platform `test-stack.mjs --serve` plus
 * `scripts/cli-e2e-fixture.ts`). Nothing here mocks the network.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { Socket } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/comvi.js");

interface Credentials {
  email: string;
  password: string;
}

interface Fixture {
  organizationId: number;
  owner: Credentials;
  restricted: Credentials & { languageRestrictions: string[] };
}

export const API_URL = requiredEnv("COMVI_E2E_API_URL");

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set: run the suite through scripts/cli-e2e.mjs`);
  }
  return value;
}

let fixturePromise: Promise<Fixture> | undefined;

function fixture(): Promise<Fixture> {
  fixturePromise ??= readFile(requiredEnv("CLI_E2E_FIXTURE"), "utf-8").then(
    (text) => JSON.parse(text) as Fixture,
  );
  return fixturePromise;
}

class Session {
  private constructor(private readonly cookie: string) {}

  static async login(credentials: Credentials): Promise<Session> {
    const response = await fetch(`${API_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      throw new Error(`login ${credentials.email} → ${response.status} ${await response.text()}`);
    }
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return new Session(cookie);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        cookie: this.cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${response.status} ${text}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export type KeyName = "full" | "read" | "noschema" | "restricted";

const KEY_PERMISSIONS: Record<Exclude<KeyName, "restricted">, string[]> = {
  full: ["project:read", "translations:read", "translations:write", "schema:read"],
  read: ["translations:read"],
  noschema: ["translations:read", "translations:write"],
};

export interface E2EProject {
  id: number;
  keys: Record<KeyName, string>;
  keyIds: Record<KeyName, number>;
  /** Owner session, for arranging state the CLI does not create itself. */
  owner: Session;
}

let projectCounter = 0;

/**
 * A fresh project per test file: source locale `en`, the platform's default
 * namespace, the extra `locales`, and one API key per permission set.
 */
export async function createProject(
  options: { locales?: string[]; customLocales?: string[] } = {},
): Promise<E2EProject> {
  const { organizationId, owner, restricted } = await fixture();
  const ownerSession = await Session.login(owner);

  const project = await ownerSession.request<{ id: number }>("POST", "/v1/projects", {
    organizationId,
    name: `CLI e2e ${process.pid}-${Date.now()}-${++projectCounter}`,
    sourceLocaleCode: "en",
  });

  for (const code of options.locales ?? []) {
    await ownerSession.request("POST", `/v1/projects/${project.id}/locales`, {
      isCustom: false,
      localeCode: code,
    });
  }
  for (const code of options.customLocales ?? []) {
    await ownerSession.request("POST", `/v1/projects/${project.id}/locales`, {
      isCustom: true,
      code,
      name: code,
      nativeName: code,
    });
  }

  const createKey = (session: Session, name: string, permissions: string[]) =>
    session.request<{ id: number; token: string }>("POST", `/v1/projects/${project.id}/api-keys`, {
      name,
      permissions,
    });

  const keys = {} as Record<KeyName, string>;
  const keyIds = {} as Record<KeyName, number>;
  for (const [name, permissions] of Object.entries(KEY_PERMISSIONS)) {
    ({ token: keys[name as KeyName], id: keyIds[name as KeyName] } = await createKey(
      ownerSession,
      `e2e-${name}`,
      permissions,
    ));
  }
  ({ token: keys.restricted, id: keyIds.restricted } = await createKey(
    await Session.login(restricted),
    "e2e-restricted",
    KEY_PERMISSIONS.full,
  ));

  return { id: project.id, keys, keyIds, owner: ownerSession };
}

export interface Workspace {
  dir: string;
  write(relativePath: string, content: string | object): Promise<void>;
  read(relativePath: string): Promise<string>;
  readJson<T = Record<string, string>>(relativePath: string): Promise<T>;
  cleanup(): Promise<void>;
}

/** A temp app directory with `package.json` and the given `.comvirc.json`. */
export async function createWorkspace(config: object = {}): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), "comvi-cli-e2e-"));
  const workspace: Workspace = {
    dir,
    async write(relativePath, content) {
      const target = join(dir, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        typeof content === "string" ? content : JSON.stringify(content, null, 2),
      );
    },
    read: (relativePath) => readFile(join(dir, relativePath), "utf-8"),
    async readJson(relativePath) {
      return JSON.parse(await workspace.read(relativePath));
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
  await workspace.write("package.json", { name: "e2e-app", dependencies: { "@comvi/core": "*" } });
  await workspace.write(".comvirc.json", config);
  return workspace;
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  cwd: string;
  apiKey?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

function spawnCli(
  args: string[],
  options: CliOptions,
): ChildProcess & {
  stdout: NonNullable<ChildProcess["stdout"]>;
  stderr: NonNullable<ChildProcess["stderr"]>;
} {
  return spawn(process.execPath, [BIN, ...args], {
    cwd: options.cwd,
    env: {
      PATH: process.env.PATH ?? "",
      // Never the developer's home: nothing in it may reach the CLI under test.
      HOME: options.cwd,
      COMVI_NO_ENV: "1",
      COMVI_API_BASE_URL: API_URL,
      ...(options.apiKey ? { COMVI_API_KEY: options.apiKey } : {}),
      ...options.env,
    } as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Runs the built CLI with a minimal env: the API URL, an optional key, `.env` loading off. */
export function runCli(args: string[], options: CliOptions): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawnCli(args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`comvi ${args.join(" ")} timed out\n${stdout}\n${stderr}`));
    }, options.timeoutMs ?? 60_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** Reads the project's translations straight from the API, bypassing the CLI. */
export async function fetchRemote(
  apiKey: string,
): Promise<Record<string, Record<string, Record<string, string>>>> {
  const response = await fetch(`${API_URL}/v1/translations`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`GET /v1/translations → ${response.status}`);
  }
  const body = (await response.json()) as {
    namespaces: Record<string, Record<string, Record<string, string>>>;
  };
  return body.namespaces;
}

export interface RunningCli {
  output(): string;
  /** The current length of the output, to wait only for what comes after it. */
  mark(): number;
  /** Resolves once the output after `since` matches; rejects on exit or timeout. */
  waitFor(pattern: RegExp, options?: { since?: number; timeoutMs?: number }): Promise<void>;
  /** The exit code, or a rejection carrying the output if it has not exited in time. */
  exitedWithin(timeoutMs: number): Promise<number | null>;
  /** SIGTERM, then SIGKILL if the process is still running 5 s later. */
  stop(): Promise<number | null>;
}

/** Starts a long-running CLI command such as `typegen --watch`. */
export function startCli(args: string[], options: CliOptions): RunningCli {
  const child = spawnCli(args, options);
  let text = "";
  let closed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const append = (chunk: Buffer) => {
    text += chunk.toString();
    notify();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const exited = new Promise<number | null>((resolveExit) => {
    child.on("error", (error) => {
      text += `\n[spawn error] ${error.message}`;
      closed = true;
      notify();
      resolveExit(null);
    });
    // "close" comes after the last output; "exit" may come before it.
    child.on("close", (code) => {
      closed = true;
      notify();
      resolveExit(code);
    });
  });

  const exitedWithin = (timeoutMs: number) =>
    new Promise<number | null>((resolveExit, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`still running after ${timeoutMs} ms:\n${text}`)),
        timeoutMs,
      );
      void exited.then((code) => {
        clearTimeout(timer);
        resolveExit(code);
      });
    });

  return {
    output: () => text,
    mark: () => text.length,
    exitedWithin,
    waitFor(pattern, { since = 0, timeoutMs = 30_000 } = {}) {
      return new Promise((resolveWait, reject) => {
        const check = () => {
          if (pattern.test(text.slice(since))) {
            done();
            resolveWait();
          } else if (closed) {
            done();
            reject(new Error(`exited before ${pattern}:\n${text}`));
          }
        };
        const timer = setTimeout(() => {
          done();
          reject(new Error(`timed out waiting for ${pattern}:\n${text}`));
        }, timeoutMs);
        const done = () => {
          clearTimeout(timer);
          listeners.delete(check);
        };
        listeners.add(check);
        check();
      });
    },
    async stop() {
      if (closed) return exited;
      child.kill("SIGTERM");
      try {
        return await exitedWithin(5_000);
      } catch {
        child.kill("SIGKILL");
        return exited;
      }
    },
  };
}

export interface Proxy {
  url: string;
  /** Answers 502 and drops every open connection, as a restarting gateway does. */
  down(): void;
  up(): void;
  close(): Promise<void>;
}

/**
 * Sees each request before it is forwarded. It may wait (the request is held
 * until it settles), or answer instead of the API with a status and JSON body.
 */
export type ProxyIntercept = (
  request: IncomingMessage,
) => Promise<{ status: number; body: unknown } | void> | { status: number; body: unknown } | void;

/** An HTTP proxy in front of the API that a test can take down and bring back. */
export async function startProxy(target = API_URL, intercept?: ProxyIntercept): Promise<Proxy> {
  const upstream = new URL(target);
  const sockets = new Set<Socket>();
  const forwards = new Set<ClientRequest>();
  let isDown = false;
  const server: Server = createServer(async (req, res) => {
    const badGateway = () => res.writeHead(502, { "content-type": "text/html" }).end("bad gateway");
    if (isDown) {
      badGateway();
      return;
    }
    // Registered before the intercept may wait: a client that goes away
    // meanwhile is not forwarded, and one that goes away later takes its
    // upstream request with it, so the API does not keep streaming to nobody.
    let clientGone = false;
    let forward: ClientRequest | undefined = undefined;
    res.on("close", () => {
      clientGone = true;
      forward?.destroy();
    });
    let answer: Awaited<ReturnType<ProxyIntercept>>;
    try {
      answer = await intercept?.(req);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `proxy intercept failed: ${String(error)}` }));
      return;
    }
    if (clientGone) return;
    // The proxy may have gone down while the intercept waited.
    if (isDown) {
      badGateway();
      return;
    }
    if (answer) {
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
      return;
    }
    forward = httpRequest(
      {
        host: upstream.hostname,
        port: upstream.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        // An SSE stream may send its headers long before its first event.
        res.flushHeaders();
        response.pipe(res);
      },
    );
    const upstreamRequest = forward;
    forwards.add(upstreamRequest);
    upstreamRequest.on("close", () => forwards.delete(upstreamRequest));
    upstreamRequest.on("error", () => res.destroy());
    req.pipe(upstreamRequest);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as { port: number };

  const dropAll = () => {
    for (const forward of forwards) forward.destroy();
    for (const socket of sockets) socket.destroy();
  };

  return {
    url: `http://127.0.0.1:${port}`,
    down() {
      isDown = true;
      dropAll();
    },
    up() {
      isDown = false;
    },
    close() {
      dropAll();
      return new Promise((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

export interface MachineTranslation {
  /** The full permissions plus `mt:use`: the key the CLI runs with. */
  apiKey: string;
  /**
   * Another key with `mt:use`, for the test's own dry-run fills: mt/fill is
   * limited to 10 requests a minute per key, and the CLI's key needs them.
   */
  probeKey: string;
}

/**
 * Turns on machine translation for the project: Google (the platform's fake
 * under MT_FAKE_PROVIDER) as the only provider, and `autoApply` as asked.
 * The `full` key stays without `mt:use`.
 */
export async function enableMachineTranslation(
  project: E2EProject,
  { autoApply = false }: { autoApply?: boolean } = {},
): Promise<MachineTranslation> {
  await project.owner.request("PATCH", `/v1/projects/${project.id}`, {
    mtSettings: { enabledProviders: ["google"], primaryProvider: "google", autoApply },
  });
  const createKey = async (name: string) =>
    (
      await project.owner.request<{ token: string }>(
        "POST",
        `/v1/projects/${project.id}/api-keys`,
        { name, permissions: [...KEY_PERMISSIONS.full, "mt:use"] },
      )
    ).token;
  return { apiKey: await createKey("e2e-mt"), probeKey: await createKey("e2e-mt-probe") };
}

export interface FillPairs {
  toTranslate: number;
  alreadyInFlight: number;
  alreadyTranslated: number;
  noSource: number;
}

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

/**
 * The platform's own count of the project's pairs: a dry-run `mt/fill` with
 * the probe key. A 429 waits for its Retry-After and asks again.
 */
export async function fillDryRun(
  probeKey: string,
  deadline = Date.now() + 90_000,
): Promise<FillPairs> {
  const project = await fetch(`${API_URL}/v1/project`, {
    headers: { authorization: `Bearer ${probeKey}` },
  });
  if (!project.ok) throw new Error(`GET /v1/project → ${project.status}`);
  const { id } = (await project.json()) as { id: number };
  for (;;) {
    const response = await fetch(`${API_URL}/v1/projects/${id}/mt/fill`, {
      method: "POST",
      headers: { authorization: `Bearer ${probeKey}`, "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    if (response.ok) return ((await response.json()) as { pairs: FillPairs }).pairs;
    if (response.status !== 429 || Date.now() > deadline) {
      throw new Error(`dry-run mt/fill → ${response.status} ${await response.text()}`);
    }
    await delay(Number(response.headers.get("retry-after") ?? 6) * 1_000);
  }
}

/**
 * Resolves once no MT job of the project is waiting, delayed or active: the
 * platform's dry-run fill counts every missing pair such a job holds as
 * `alreadyInFlight`, auto-MT retries between attempts included (they back
 * off 10 s), so 0 means nothing can still charge credits.
 */
export async function waitForMtIdle(probeKey: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((await fillDryRun(probeKey, deadline)).alreadyInFlight > 0) {
    if (Date.now() > deadline) throw new Error(`MT jobs still in flight after ${timeoutMs} ms`);
    await delay(2_000);
  }
}

const execFileAsync = promisify(execFile);

/**
 * Gives the fixture organization exactly `credits` MT credits, with its usage
 * back at 0, through the platform's `cli-e2e-fixture.ts set-mt-credits`.
 */
export async function setMtCredits(credits: number): Promise<void> {
  const { organizationId } = await fixture();
  await execFileAsync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/cli-e2e-fixture.ts",
      "set-mt-credits",
      String(organizationId),
      String(credits),
    ],
    { cwd: requiredEnv("CLI_E2E_API_DIR"), env: process.env },
  );
}

/** The MT credits the fixture organization used in this period, from its billing usage. */
export async function mtCreditsUsed(project: E2EProject): Promise<number> {
  const { organizationId } = await fixture();
  const usage = await project.owner.request<{ mtCredits: { current: number } }>(
    "GET",
    `/v1/organizations/${organizationId}/billing/usage`,
  );
  return usage.mtCredits.current;
}

export interface RemoteValue {
  value: string;
  status: string;
}

/** Every key of the project with its values and their review status, as its owner sees them. */
export async function listKeys(
  project: E2EProject,
): Promise<
  Array<{ id: number; key: string; namespace: string; translations: Record<string, RemoteValue> }>
> {
  const keys = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
    const page = await project.owner.request<{
      data: Array<{
        id: number;
        key: string;
        namespace: string;
        translations: Record<string, RemoteValue>;
      }>;
      pagination: { nextCursor: string | null; hasMore: boolean };
    }>("GET", `/v1/projects/${project.id}/keys?${query}`);
    keys.push(...page.data);
    cursor = page.pagination.hasMore ? (page.pagination.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return keys;
}

/** The origin (`machine`, `human` or null) of a value's latest change, from the key's history. */
export async function valueOrigin(
  project: E2EProject,
  keyId: number,
  locale: string,
): Promise<string | null | undefined> {
  const history = await project.owner.request<{
    data: Array<{ localeCode: string | null; newState: { origin?: string | null } | null }>;
  }>("GET", `/v1/projects/${project.id}/translations/${keyId}/history`);
  // Newest first.
  return history.data.find((entry) => entry.localeCode === locale)?.newState?.origin;
}

/** Deletes one of the project's API keys, as its owner. */
export async function revokeKey(project: E2EProject, name: KeyName): Promise<void> {
  await project.owner.request("DELETE", `/v1/api-keys/${project.keyIds[name]}`);
}
