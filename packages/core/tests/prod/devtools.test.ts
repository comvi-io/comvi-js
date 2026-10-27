// @vitest-environment happy-dom
/**
 * The devtools hook works the same in a production build (`__DEV__` false): the extension
 * runs against production sites. The entry, the marking hook with its opt-out, and the
 * loader's refusal of anything but a version.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { devtools, type ComviQueueEntry } from "../../src/devtools";

const win = window as { __COMVI__?: ComviQueueEntry[] };
afterEach(() => {
  delete win.__COMVI__;
});

describe("devtools in a production build", () => {
  it("pushes the entry, marks under a session, honours markers: false", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hi" } },
      plugins: [devtools()],
    });
    const { x } = win.__COMVI__![0];
    const mk = vi.fn((out: unknown) => `*${out}`);
    x.mark(mk);
    expect(i18n.t("hi")).toBe("*Hi");
    expect(i18n.t("gone")).toBe("*gone");
    expect(i18n.t("hi", { markers: false })).toBe("Hi");
    expect(mk).toHaveBeenCalledTimes(2);
    i18n.destroy();
    expect(win.__COMVI__).toEqual([]);
  });

  it("load() refuses a URL with a rejection, creating no script", async () => {
    createI18n({ locale: "en", plugins: [devtools()] });
    const p = win.__COMVI__![0].x.load("https://evil.example/x.js");
    await expect(p).rejects.toThrow(TypeError);
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });
});
