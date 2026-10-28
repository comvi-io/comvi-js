import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { promises as nodeFs, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname, join } from "path";
import { makeTempDir, removeTempDirs } from "./helpers";
import { CLI_VERSION } from "../src/utils/version";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { ApiClient } from "../src/core/ApiClient";
import { TranslationSync } from "../src/core/TranslationSync";

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

  describe("atomic writes", () => {
    afterEach(removeTempDirs);

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
