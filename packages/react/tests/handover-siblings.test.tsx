/**
 * Sibling handovers on one instance at hydration (owner, 2026-11-11). A `null` slot one handover
 * renders is marked only in its own subtree until its commit, so a sibling's subtree reads the
 * instance as it was created. The supported shape — the instance created from the first paint's
 * payload, as the README orders it and `@comvi/next/client` always does — takes the server's
 * branch in every subtree (pinning).
 */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";

describe("sibling handovers on one instance", () => {
  for (const inflight of [false, true])
    it(`the instance from the payload: the sibling's subtree takes the server's branch${inflight ? " (a client load of another namespace in flight)" : ""}`, async () => {
      const A = { admin: { en: null } };
      const B = { default: { en: { x: "x" } } };
      const seen: string[] = [];
      function Tpl() {
        const { isReady, isLoading } = useI18n("admin");
        seen.push(`${isReady}/${isLoading}`);
        return isReady ? <p>ok</p> : isLoading ? <i>loading</i> : <b>unavailable</b>;
      }
      const ui = (i: I18n) => (
        <I18nProvider i18n={i}>
          <I18nHandover catalogs={A}>{null}</I18nHandover>
          <I18nHandover catalogs={B}>
            <Tpl />
          </I18nHandover>
        </I18nProvider>
      );
      const html = renderToString(
        ui(createI18n({ locale: "en", catalogs: { ...A, ...B }, onError: () => {} })),
      );
      expect(html).toBe("<b>unavailable</b>");
      seen.length = 0;
      const loader = vi.fn((_l: string, _n: string) =>
        inflight ? new Promise<Record<string, string>>(() => {}) : Promise.resolve({}),
      );
      const client = createI18n({
        locale: "en",
        loader,
        onError: () => {},
        catalogs: { ...A, ...B },
        ...(inflight && { namespaces: ["shop"] }),
      });
      const el = document.createElement("div");
      el.innerHTML = html;
      document.body.append(el);
      const errors: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let root: { unmount(): void } | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(el, ui(client), { onRecoverableError: (e) => errors.push(e) });
        });
        await act(async () => {});
        expect(seen.every((f) => f === "false/false")).toBe(true);
        expect(errors).toEqual([]);
        expect(err).not.toHaveBeenCalled();
        expect(el.innerHTML).toBe(html);
        expect(loader.mock.calls.filter((c) => c[1] === "admin")).toEqual([]);
      } finally {
        err.mockRestore();
        root?.unmount();
        el.remove();
      }
    });
});
