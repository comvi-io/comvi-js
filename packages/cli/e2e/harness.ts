/**
 * Drives the built `bin/comvi.js` against a real platform API started by
 * `scripts/cli-e2e.mjs` (platform `test-stack.mjs --serve` plus
 * `scripts/cli-e2e-fixture.ts`). Nothing here mocks the network.
 */
import { spawn } from "node:child_process";
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
    session
      .request<{ token: string }>("POST", `/v1/projects/${project.id}/api-keys`, {
        name,
        permissions,
      })
      .then(({ token }) => token);

  const keys = {} as Record<KeyName, string>;
  for (const [name, permissions] of Object.entries(KEY_PERMISSIONS)) {
    keys[name as KeyName] = await createKey(ownerSession, `e2e-${name}`, permissions);
  }
  keys.restricted = await createKey(
    await Session.login(restricted),
    "e2e-restricted",
    KEY_PERMISSIONS.full,
  );

  return { id: project.id, keys, owner: ownerSession };
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

/** Runs the built CLI with a minimal env: the API URL, an optional key, `.env` loading off. */
export function runCli(
  args: string[],
  options: { cwd: string; apiKey?: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
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
