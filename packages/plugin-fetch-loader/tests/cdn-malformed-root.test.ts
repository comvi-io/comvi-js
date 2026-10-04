/**
 * A CDN catalog whose JSON root is not an object is rejected with the same
 * error the API loader raises for the same shape. The CDN path used to hand an
 * array, a string or `null` straight to `addMessages`, which turned a
 * string into per-character keys and `null` into an empty catalog instead of a
 * reported load failure. RC review, non-blocking "malformed CDN roots".
 */
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchLoaderPlugin } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { server, TEST_CDN_URL, buildTestCdnUrl } from "./setup";

/** Whatever msw will serialise as a JSON body — including the non-objects under test. */
type JsonRoot = Parameters<typeof HttpResponse.json>[0];

function mockRoot(body: JsonRoot) {
  server.use(http.get(buildTestCdnUrl("en", "default"), () => HttpResponse.json(body)));
}

describe("a CDN catalog whose root is not an object", () => {
  it.each<[label: string, body: JsonRoot]>([
    ["an array", [1, 2, 3]],
    ["a string", "greeting"],
    ["null", null],
    ["a number", 7],
  ])("rejects %s", async (_label, body) => {
    const i18n = new I18n({ locale: "en", devMode: false });
    mockRoot(body);

    await fetchLoaderPlugin({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(
      /Invalid CDN response: "en:default" must be an object/,
    );
  });

  it("reports the failure through onLoadError instead of storing junk keys", async () => {
    const onLoadError = vi.fn();
    const i18n = new I18n({ locale: "en", devMode: false });
    mockRoot("greeting");

    await fetchLoaderPlugin({ cdnUrl: TEST_CDN_URL, onLoadError })(i18n);

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(i18n.getLoadedLocales()).toEqual([]);
  });

  it("still accepts an ordinary object root", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    mockRoot({ greeting: "Hello" });

    await fetchLoaderPlugin({ cdnUrl: TEST_CDN_URL })(i18n);

    expect(i18n.t("greeting")).toBe("Hello");
  });
});
