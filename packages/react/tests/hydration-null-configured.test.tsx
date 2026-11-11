/**
 * A real hydration with a configured namespace (the `namespaces` option) that failed on the
 * server (`null` in `handover()`), read by `useI18n()` with no argument, whose flags cover
 * `default` and the configured namespaces: the ordinary readiness template takes the server's
 * branch, React reports nothing and the hydration asks for nothing (lot 6a null-slot fix, owner
 * decision 2026-11-10).
 */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handover } from "@comvi/core/ssr";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";

const seen: string[] = [];
function Tpl() {
  const { t, isReady, isLoading } = useI18n();
  seen.push(`${isReady}/${isLoading}`);
  return isReady ? <p>{t("x") as string}</p> : isLoading ? <i>loading</i> : <b>unavailable</b>;
}

let roots: { unmount(): void }[] = [];
afterEach(() => {
  roots.forEach((r) => r.unmount());
  roots = [];
  document.body.innerHTML = "";
});

const ok = { uk: { x: "x" }, en: { x: "x" } };

describe("useI18n() over a configured namespace the server failed", () => {
  for (const late of [false, true])
    for (const fallback of [false, true])
      for (const never of [false, true])
        it(`${late ? "payload through <I18nHandover> only" : "instance from the payload"}, ${fallback ? "fallback loaded" : "no catalog at all"}, a client loader${never ? " that never answers" : ""}: same branch, no warning, no request`, async () => {
          const server = createI18n({
            locale: "uk",
            fallbackLocale: "en",
            timeZone: "UTC",
            namespaces: ["admin"],
            loader: async (l, n) => {
              if (n === "admin" && (l === "uk" || !fallback)) throw new Error("down");
              return n === "admin" ? { t: l } : ok[l as "uk" | "en"];
            },
            onError: () => {},
          });
          await server.ready.catch(() => {});
          // What `useI18n()` reads: `default` (the server preloads it) and the configured `admin`.
          await server.load("default");
          const payload = handover(server);
          expect(payload.catalogs.admin.uk).toBe(null);
          const ui = (i: I18n) => (
            <I18nProvider i18n={i}>
              <I18nHandover catalogs={payload.catalogs}>
                <Tpl />
              </I18nHandover>
            </I18nProvider>
          );
          seen.length = 0;
          const html = renderToString(ui(server));
          const serverFlags = seen.splice(0);
          // `never`: a load the instance starts at creation is still in flight at the hydration.
          const loader = vi.fn(() =>
            never
              ? new Promise<Record<string, string>>(() => {})
              : Promise.resolve({ x: "client" }),
          );
          const client = createI18n({
            fallbackLocale: "en",
            namespaces: ["admin"],
            loader,
            onError: () => {},
            ...(late
              ? {
                  locale: "uk",
                  timeZone: "UTC",
                  serverNow: payload.serverNow,
                  catalogs: { default: ok },
                }
              : payload),
          });
          // A configured namespace the instance was created without is loaded at creation (the
          // instance's own start, before any render): what the late variant asks for, if anything,
          // is asked here. Nothing more is asked for after the hydration.
          const atCreation = loader.mock.calls.length;
          const el = document.createElement("div");
          el.innerHTML = html;
          document.body.append(el);
          const recoverable: unknown[] = [];
          const err = vi.spyOn(console, "error").mockImplementation(() => {});
          await act(async () => {
            roots.push(
              hydrateRoot(el, ui(client), { onRecoverableError: (e) => recoverable.push(e) }),
            );
          });
          await act(async () => {});
          const errors = err.mock.calls.map((c) => String(c[0]));
          err.mockRestore();
          expect(serverFlags).toEqual([fallback ? "true/false" : "false/false"]);
          if (late && never && fallback)
            // The fallback's catalog is handed, and the client's own load of that pair is really
            // in flight: `isLoading` reads it (a GA-list item), the branch is the server's.
            expect(seen.every((f) => f.startsWith("true/"))).toBe(true);
          else expect(seen.every((f) => f === serverFlags[0])).toBe(true);
          expect(recoverable).toEqual([]);
          expect(errors).toEqual([]);
          expect(el.innerHTML).toBe(html);
          expect(loader).toHaveBeenCalledTimes(atCreation);
          if (!late) expect(atCreation).toBe(0);
        });
});
