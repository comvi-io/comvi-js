/**
 * Key-management round trip through the proxy, using the exact requests the
 * in-context editor's translationService builds. Whatever the proxy lets the
 * editor save it must also let the editor read back and delete; whatever it
 * refuses to read or delete it must refuse to save, with a useful error.
 *
 * Cross-package (imports the editor's source), so it lives beside
 * proxy-crossrepo.test.ts rather than in the isolated proxy.*.test.ts suites.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateProxyRequest, type ProxySessionContext } from "../proxy";

/**
 * The editor's translationService, loaded by computed path so the extension's
 * TypeScript project (rootDir = this package) does not compile editor sources.
 */
interface EditorTranslationService {
  saveTranslation(
    key: string,
    ns: string,
    translations: Record<string, Record<string, string>>,
    isPlural: boolean,
  ): Promise<unknown>;
  getTranslation(key: string, ns: string): Promise<unknown>;
  deleteTranslation(key: string, ns: string): Promise<void>;
}
const TRANSLATION_SERVICE: string = new URL(
  "../../../../../packages/plugin-in-context-editor/src/services/translationService.ts",
  import.meta.url,
).pathname;

const requests: Array<{ path: string; method: string; body?: string }> = [];

vi.mock("../../../../../packages/plugin-in-context-editor/src/services/apiClient", () => ({
  apiFetch: vi.fn(async (_scopeId: unknown, path: string, init: RequestInit = {}) => {
    requests.push({
      path,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? init.body : undefined,
    });
    return new Response(JSON.stringify({ key: "", isPlural: false, translations: {} }), {
      status: 200,
    });
  }),
}));
vi.mock("../../../../../packages/plugin-in-context-editor/src/config/api", () => ({
  isDemoMode: () => false,
}));

const CTX: ProxySessionContext = {
  origin: "https://app.example.com",
  projectId: 42,
  collectContext: false,
};

/** The PUT, GET and DELETE the editor sends for one key, in that order. */
async function editorRequestsFor(key: string, namespace: string) {
  const service = (await import(
    /* @vite-ignore */ TRANSLATION_SERVICE
  )) as EditorTranslationService;
  requests.length = 0;
  const swallow = () => undefined;
  await service.saveTranslation(key, namespace, { en: { other: "Hello" } }, false).catch(swallow);
  await service.getTranslation(key, namespace).catch(swallow);
  await service.deleteTranslation(key, namespace).catch(swallow);
  expect(requests.map((request) => request.method)).toEqual(["PUT", "GET", "DELETE"]);
  return requests.map((request, index) =>
    validateProxyRequest({ id: `r${index}`, ...request }, "https://api.comvi.io", CTX),
  );
}

beforeEach(() => {
  requests.length = 0;
});

describe("editor key round trip through the proxy", () => {
  it.each([
    ["a 768-character ASCII key", "k".repeat(768), "app"],
    ["a 600-character key", "k".repeat(600), "app"],
    // Worst case for the encoded path: every character encodes to 9 bytes.
    ["768 three-byte characters in a 255-character namespace", "ア".repeat(768), "名".repeat(255)],
    ["spaces, dots and percent signs", "hero title.100% done?", "common"],
  ])("lets the editor save, read and delete %s", async (_label, key, namespace) => {
    const [save, read, remove] = await editorRequestsFor(key, namespace);

    expect(save).toMatchObject({ ok: true });
    expect(read).toMatchObject({ ok: true });
    expect(remove).toMatchObject({ ok: true });
  });

  it.each([
    ["a key with a slash", "a/b", "app"],
    ["a key with a backslash", "a\\b", "app"],
    ["a namespace with a slash", "title", "app/admin"],
  ])("refuses %s on all three calls, explaining why on save", async (_label, key, namespace) => {
    const [save, read, remove] = await editorRequestsFor(key, namespace);

    expect(save).toEqual({
      ok: false,
      error: 'Keys and namespaces containing "/" or "\\" cannot be edited through the extension',
    });
    expect(read).toMatchObject({ ok: false });
    expect(remove).toMatchObject({ ok: false });
  });

  // URL parsing turns an exact "." or ".." path segment into a directory
  // step, so the generated GET/DELETE can never address such a key.
  it.each([
    ["a key that is a single dot", ".", "app"],
    ["a key that is two dots", "..", "app"],
    ["a namespace that is a single dot", "title", "."],
    ["a namespace that is two dots", "title", ".."],
  ])("refuses %s on all three calls, explaining why on save", async (_label, key, namespace) => {
    const [save, read, remove] = await editorRequestsFor(key, namespace);

    expect(save).toEqual({
      ok: false,
      error: 'Keys and namespaces named "." or ".." cannot be edited through the extension',
    });
    expect(read).toMatchObject({ ok: false });
    expect(remove).toMatchObject({ ok: false });
  });

  it.each([["keys that only contain dots", "...", "a..b"]])(
    "still accepts %s",
    async (_label, key, namespace) => {
      const [save, read, remove] = await editorRequestsFor(key, namespace);

      expect(save).toMatchObject({ ok: true });
      expect(read).toMatchObject({ ok: true });
      expect(remove).toMatchObject({ ok: true });
    },
  );

  it.each([
    ["a 769-character key", "k".repeat(769), "app"],
    ["a 256-character namespace", "title", "n".repeat(256)],
  ])("refuses %s on all three calls", async (_label, key, namespace) => {
    const [save, read, remove] = await editorRequestsFor(key, namespace);

    expect(save).toMatchObject({ ok: false });
    expect(read).toMatchObject({ ok: false });
    expect(remove).toMatchObject({ ok: false });
  });
});
