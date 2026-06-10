import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as nodeFs, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { CLI_VERSION } from "../src/utils/version";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { ApiClient } from "../src/core/ApiClient";
import { FileSystemWriter, InMemoryFileSystem } from "../src/core/FileSystemWriter";
import { TranslationSync } from "../src/core/TranslationSync";
import type { ProjectSchema } from "../src/types";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("CLI hardening", () => {
  describe("version", () => {
    it("matches package.json", () => {
      const pkg = JSON.parse(readFileSync(resolve(PKG_DIR, "package.json"), "utf-8"));
      expect(CLI_VERSION).toBe(pkg.version);
      expect(CLI_VERSION).not.toBe("0.0.0");
    });
  });

  describe("ConfigLoader.create permissions", () => {
    const tmpFiles: string[] = [];

    afterEach(async () => {
      for (const f of tmpFiles) {
        try {
          await nodeFs.unlink(f);
        } catch {
          // already gone
        }
      }
      tmpFiles.length = 0;
    });

    it("writes 0600 when the config contains an apiKey", async () => {
      const outputPath = "/tmp/.comvirc-test-mode-secret.json";
      tmpFiles.push(outputPath);

      await ConfigLoader.create({ apiKey: "secret-key" }, outputPath);

      const stat = await nodeFs.stat(outputPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it("keeps default permissions without an apiKey", async () => {
      const outputPath = "/tmp/.comvirc-test-mode-plain.json";
      tmpFiles.push(outputPath);

      await ConfigLoader.create({}, outputPath);

      const stat = await nodeFs.stat(outputPath);
      expect(stat.mode & 0o077).not.toBe(0); // group/other readable is fine here
    });
  });

  describe("ApiClient retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("retries 429 honoring Retry-After and succeeds", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "1" } }),
        )
        .mockResolvedValueOnce(jsonResponse({ id: 1, name: "proj" }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.validateApiKey();
      await vi.advanceTimersByTimeAsync(1100);

      await expect(promise).resolves.toEqual({ id: 1, name: "proj" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries 5xx for GET requests", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ id: 1, name: "proj" }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.validateApiKey();
      await vi.advanceTimersByTimeAsync(600);

      await expect(promise).resolves.toEqual({ id: 1, name: "proj" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up after bounded retries", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 500 }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.validateApiKey();
      const assertion = expect(promise).rejects.toThrow(/500/);
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("does not retry a 5xx on push (non-idempotent POST)", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 1, name: "proj" })) // validateApiKey
        .mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 500 }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.pushTranslations({
        translations: { en: { common: { hello: "Hi" } } },
        forceMode: "override",
      });
      const assertion = expect(promise).rejects.toThrow(/500/);
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2); // no retry of the POST
    });
  });

  describe("SSE serialization", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.doUnmock("eventsource");
      vi.resetModules();
    });

    it("processes schema updates one at a time, in order", async () => {
      const instances: any[] = [];
      vi.doMock("eventsource", () => ({
        EventSource: class {
          onmessage: ((event: MessageEvent) => void) | null = null;
          onerror: (() => void) | null = null;
          constructor() {
            instances.push(this);
          }
          close() {}
        },
      }));

      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "proj" }), { status: 200 }));

      const { ApiClient: MockedApiClient } = await import("../src/core/ApiClient");
      const client = new MockedApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });

      const seen: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((r) => {
        releaseFirst = r;
      });

      const cleanup = await client.subscribeToSchemaUpdates(async (schema: ProjectSchema) => {
        const tag = (schema as any).tag as string;
        seen.push(`start:${tag}`);
        if (tag === "a") {
          await firstGate;
        }
        seen.push(`end:${tag}`);
      });

      const es = instances[0];
      es.onmessage({ data: JSON.stringify({ tag: "a", keys: {} }) } as MessageEvent);
      es.onmessage({ data: JSON.stringify({ tag: "b", keys: {} }) } as MessageEvent);

      await vi.waitFor(() => expect(seen).toContain("start:a"));
      expect(seen).not.toContain("start:b"); // b waits for a

      releaseFirst();
      await vi.waitFor(() => expect(seen).toEqual(["start:a", "end:a", "start:b", "end:b"]));

      cleanup();
    });
  });

  describe("atomic writes", () => {
    it("FileSystemWriter uses temp + rename when the fs supports it", async () => {
      const calls: string[] = [];
      const files = new Map<string, string>();
      const fakeFs = {
        async mkdir() {},
        async writeFile(path: string, content: string) {
          calls.push(`write:${path}`);
          files.set(path, content);
        },
        async readFile(path: string) {
          return files.get(path) ?? "";
        },
        async access() {},
        async rename(oldPath: string, newPath: string) {
          calls.push(`rename:${oldPath}->${newPath}`);
          files.set(newPath, files.get(oldPath) ?? "");
          files.delete(oldPath);
        },
      };

      const writer = new FileSystemWriter(fakeFs);
      await writer.write("/out/types.d.ts", "content");

      expect(calls[0]).toMatch(/^write:\/out\/types\.d\.ts\..*\.tmp$/);
      expect(calls[1]).toMatch(/^rename:.*\.tmp->\/out\/types\.d\.ts$/);
      expect(files.get("/out/types.d.ts")).toBe("content");
      expect([...files.keys()].some((k) => k.endsWith(".tmp"))).toBe(false);
    });

    it("FileSystemWriter falls back to plain write without rename support", async () => {
      const memFs = new InMemoryFileSystem();
      const writer = new FileSystemWriter(memFs);

      await writer.write("/out/types.d.ts", "content");

      expect(memFs.getFile("/out/types.d.ts")).toBe("content");
      expect(memFs.hasFile(`/out/types.d.ts.${process.pid}.tmp`)).toBe(false);
    });

    it("TranslationSync leaves no temp files after writeTranslations", async () => {
      const dir = `/tmp/comvi-sync-atomic-${process.pid}`;
      const sync = new TranslationSync({
        translationsPath: dir,
        fileTemplate: "{languageTag}/{namespace}.json",
        format: "json",
      });

      await sync.writeTranslations({
        locales: ["en"],
        namespaces: ["common"],
        translations: { en: { common: { hello: "Hi" } } },
      });

      const entries = await nodeFs.readdir(`${dir}/en`);
      expect(entries).toEqual(["common.json"]);
      const written = JSON.parse(await nodeFs.readFile(`${dir}/en/common.json`, "utf-8"));
      expect(written).toEqual({ hello: "Hi" });

      await nodeFs.rm(dir, { recursive: true, force: true });
    });
  });
});
