/**
 * Drives the built `bin/comvi.js` against a real platform API started by
 * `scripts/cli-e2e.mjs` (platform `test-stack.mjs --serve` plus
 * `scripts/cli-e2e-fixture.ts`). Nothing here mocks the network.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request as httpRequest, type ClientRequest, type Server } from "node:http";
import type { Socket } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/** An HTTP proxy in front of the API that a test can take down and bring back. */
export async function startProxy(target = API_URL): Promise<Proxy> {
  const upstream = new URL(target);
  const sockets = new Set<Socket>();
  const forwards = new Set<ClientRequest>();
  let isDown = false;
  const server: Server = createServer((req, res) => {
    if (isDown) {
      res.writeHead(502, { "content-type": "text/html" }).end("bad gateway");
      return;
    }
    const forward = httpRequest(
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
    forwards.add(forward);
    forward.on("close", () => forwards.delete(forward));
    forward.on("error", () => res.destroy());
    // A client that goes away takes its upstream request with it, so the API
    // does not keep streaming to nobody.
    res.on("close", () => forward.destroy());
    req.pipe(forward);
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

/** Deletes one of the project's API keys, as its owner. */
export async function revokeKey(project: E2EProject, name: KeyName): Promise<void> {
  await project.owner.request("DELETE", `/v1/api-keys/${project.keyIds[name]}`);
}
