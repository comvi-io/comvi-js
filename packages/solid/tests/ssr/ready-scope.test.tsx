/**
 * Check 9 of the ready/loading scope (owner brief 2026-11-10) on a real server render: a server
 * render of `useI18n()` waits for the configured namespaces under a Suspense boundary (its flags
 * are rendered from them), and the browser, started from `handover()`, hydrates the same branch
 * with no mismatch and no request.
 */
import { hydrate } from "solid-js/web";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createI18n, handover } from "../../src";
import { make, manualLoader, tick } from "../helpers";
import { Global, Page } from "./app";

let server: typeof import("./render.server");
beforeAll(async () => {
  server = await import("./render.server");
}, 30_000);
beforeEach(() => {
  (globalThis as { _$HY?: unknown })._$HY = {
    events: [],
    completed: new WeakSet(),
    r: {},
    fe() {},
  };
});

it("9: default inline, nav in flight: the server waits for nav, the browser hydrates the same text", async () => {
  const OPTS = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };
  const s = createI18n({
    ...OPTS,
    catalogs: { default: { en: { hi: "Hi" } } },
    loader: async () => (await tick(), {}),
  });
  const html = await server.page(s, "global");
  expect(html).toContain("Hi");
  const payload = JSON.parse(JSON.stringify(handover(s)));
  const l = manualLoader();
  const { i18n } = make({ ...OPTS, loader: l.load, ...payload });
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = html;
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const dispose = hydrate(
    () => (
      <Page i18n={i18n}>
        <Global />
      </Page>
    ),
    container,
  );
  await tick();
  const errors = err.mock.calls.map((c) => String(c[0]));
  err.mockRestore();
  expect([container.textContent, errors, l.requested]).toEqual(["Hi", [], []]);
  dispose();
});
