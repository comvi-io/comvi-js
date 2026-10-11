import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { promises as nodeFs, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname, join } from "path";
import { makeTempDir, removeTempDirs, mockEventSource, type FakeEventSource } from "./helpers";
import { CLI_VERSION } from "../src/utils/version";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { ApiClient } from "../src/core/ApiClient";
import { FileSystemWriter, InMemoryFileSystem } from "../src/core/FileSystemWriter";
import { TranslationSync } from "../src/core/TranslationSync";
import type { ProjectSchema } from "../src/types";

type TaggedSchema = ProjectSchema & { tag: string };

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
    afterEach(removeTempDirs);

    it("writes 0600 when the config contains an apiKey", async () => {
      const outputPath = join(await makeTempDir("comvi-config-mode"), ".comvirc.json");

      await ConfigLoader.create({ apiKey: "secret-key" }, outputPath);

      const stat = await nodeFs.stat(outputPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it("keeps default permissions without an apiKey", async () => {
      const dir = await makeTempDir("comvi-config-mode");
      const outputPath = join(dir, ".comvirc.json");
      const controlPath = join(dir, "control.json");

      await ConfigLoader.create({}, outputPath);
      // The claim is "no explicit 0600 was applied", not a fixed mode: a
      // hardened runner's umask makes any literal expectation wrong.
      await nodeFs.writeFile(controlPath, "{}");

      const [written, control] = await Promise.all([
        nodeFs.stat(outputPath),
        nodeFs.stat(controlPath),
      ]);
      expect(written.mode & 0o777).toBe(control.mode & 0o777);
    });

    it("does not expose a secret through the existing config when atomic replace fails", async () => {
      const dir = await makeTempDir("comvi-config-atomic");
      const outputPath = join(dir, ".comvirc.json");
      await nodeFs.writeFile(outputPath, '{"apiBaseUrl":"https://old.test"}', { mode: 0o644 });

      const renameSpy = vi
        .spyOn(nodeFs, "rename")
        .mockRejectedValueOnce(new Error("rename failed"));

      await expect(ConfigLoader.create({ apiKey: "secret-key" }, outputPath)).rejects.toThrow(
        /rename failed/,
      );

      expect(renameSpy).toHaveBeenCalledOnce();
      expect(await nodeFs.readFile(outputPath, "utf-8")).toBe('{"apiBaseUrl":"https://old.test"}');
      expect((await nodeFs.stat(outputPath)).mode & 0o777).toBe(0o644);
      expect((await nodeFs.readdir(dir)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
    });
  });

  describe("ApiClient retry", () => {
    let fetchMock: MockedFunction<typeof fetch>;

    beforeEach(() => {
      vi.useFakeTimers();
      fetchMock = vi.fn() as MockedFunction<typeof fetch>;
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries 429 honoring Retry-After and succeeds", async () => {
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

    it("honors an HTTP-date Retry-After value", async () => {
      vi.setSystemTime(new Date("2026-07-13T08:00:00.000Z"));
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            { error: "rate limited" },
            {
              status: 429,
              headers: { "Retry-After": new Date(Date.now() + 2000).toUTCString() },
            },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ id: 1, name: "proj" }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.validateApiKey();
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1100);

      await expect(promise).resolves.toEqual({ id: 1, name: "proj" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries 5xx for GET requests", async () => {
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
      fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 500 }));

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.validateApiKey();
      // the rejection handler must be attached before the backoff timers run
      const assertion = expect(promise).rejects.toThrow(/500/);
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("does not retry a 5xx on push (non-idempotent POST)", async () => {
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

    it("does not retry a 429 on push (non-idempotent POST)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 1, name: "proj" }))
        .mockResolvedValueOnce(
          jsonResponse({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "1" } }),
        );

      const client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const promise = client.pushTranslations({
        translations: { en: { common: { hello: "Hi" } } },
        forceMode: "override",
      });
      const assertion = expect(promise).rejects.toThrow(/429/);
      await vi.advanceTimersByTimeAsync(5000);

      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("SSE serialization", () => {
    afterEach(() => {
      vi.doUnmock("eventsource");
      vi.resetModules();
    });

    async function subscribeWithFakeEventSource(
      onSchema: (schema: TaggedSchema) => Promise<void>,
    ): Promise<{ es: FakeEventSource; cleanup: () => void }> {
      const { instances } = mockEventSource();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "proj" }))),
      );

      const { ApiClient: MockedApiClient } = await import("../src/core/ApiClient");
      const client = new MockedApiClient({ apiKey: "k", apiBaseUrl: "https://api.test" });
      const cleanup = await client.subscribeToSchemaUpdates((schema) =>
        onSchema(schema as TaggedSchema),
      );

      return { es: instances[0], cleanup };
    }

    it("processes schema updates one at a time, in order", async () => {
      const seen: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((r) => {
        releaseFirst = r;
      });

      const { es, cleanup } = await subscribeWithFakeEventSource(async ({ tag }) => {
        seen.push(`start:${tag}`);
        if (tag === "a") await firstGate;
        seen.push(`end:${tag}`);
      });

      es.onmessage!({ data: JSON.stringify({ tag: "a", keys: {} }) } as MessageEvent);
      es.onmessage!({ data: JSON.stringify({ tag: "b", keys: {} }) } as MessageEvent);

      await vi.waitFor(() => expect(seen).toContain("start:a"));
      expect(seen).not.toContain("start:b"); // b waits for a

      releaseFirst();
      await vi.waitFor(() => expect(seen).toEqual(["start:a", "end:a", "start:b", "end:b"]));

      cleanup();
    });

    it("drops queued schema updates after cleanup", async () => {
      const seen: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((r) => {
        releaseFirst = r;
      });

      const { es, cleanup } = await subscribeWithFakeEventSource(async ({ tag }) => {
        seen.push(`start:${tag}`);
        if (tag === "a") await firstGate;
        seen.push(`end:${tag}`);
      });

      es.onmessage!({ data: JSON.stringify({ tag: "a", keys: {} }) } as MessageEvent);
      es.onmessage!({ data: JSON.stringify({ tag: "b", keys: {} }) } as MessageEvent);
      await vi.waitFor(() => expect(seen).toEqual(["start:a"]));

      cleanup();
      releaseFirst();
      await vi.waitFor(() => expect(seen).toEqual(["start:a", "end:a"]));
    });
  });

  describe("atomic writes", () => {
    afterEach(removeTempDirs);

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
      // InMemoryFileSystem cannot enumerate its files, so "no temp file was
      // written" is pinned through the writeFile calls instead.
      const writeFile = vi.spyOn(memFs, "writeFile");
      const writer = new FileSystemWriter(memFs);

      await writer.write("/out/types.d.ts", "content");

      expect(memFs.getFile("/out/types.d.ts")).toBe("content");
      expect(writeFile).toHaveBeenCalledExactlyOnceWith("/out/types.d.ts", "content");
    });

    it("uses a different temp file for concurrent writes to the same target", async () => {
      const tempPaths: string[] = [];
      const fakeFs = {
        async mkdir() {},
        async writeFile(path: string) {
          tempPaths.push(path);
          await Promise.resolve();
        },
        async readFile() {
          return "";
        },
        async access() {},
        async rename() {},
      };
      const writer = new FileSystemWriter(fakeFs);

      await Promise.all([
        writer.write("/out/types.d.ts", "first"),
        writer.write("/out/types.d.ts", "second"),
      ]);

      expect(new Set(tempPaths).size).toBe(2);
    });

    it("cleans up its temp file when rename fails", async () => {
      const removed: string[] = [];
      const fakeFs = {
        async mkdir() {},
        async writeFile() {},
        async readFile() {
          return "";
        },
        async access() {},
        async rename() {
          throw new Error("rename failed");
        },
        async unlink(path: string) {
          removed.push(path);
        },
      };
      const writer = new FileSystemWriter(fakeFs);

      await expect(writer.write("/out/types.d.ts", "content")).rejects.toThrow(/rename failed/);

      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatch(/^\/out\/types\.d\.ts\..*\.tmp$/);
    });

    it("TranslationSync leaves no temp files after writeTranslations", async () => {
      const dir = await makeTempDir("comvi-sync-atomic");
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
    });

    it("supports concurrent writes to the same translation file", async () => {
      const dir = await makeTempDir("comvi-sync-concurrent");
      const sync = new TranslationSync({
        translationsPath: dir,
        fileTemplate: "{languageTag}/{namespace}.json",
        format: "json",
      });

      await Promise.all([
        sync.writeTranslations({
          locales: ["en"],
          namespaces: ["common"],
          translations: { en: { common: { hello: "First" } } },
        }),
        sync.writeTranslations({
          locales: ["en"],
          namespaces: ["common"],
          translations: { en: { common: { hello: "Second" } } },
        }),
      ]);

      const entries = await nodeFs.readdir(join(dir, "en"));
      expect(entries).toEqual(["common.json"]);
      expect(["First", "Second"]).toContain(
        JSON.parse(await nodeFs.readFile(join(dir, "en/common.json"), "utf-8")).hello,
      );
    });
  });
});
