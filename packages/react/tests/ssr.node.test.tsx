/**
 * Server rendering in Node (no DOM). Ported by meaning from 0.7 ssr.node.test.tsx: the
 * server snapshot is the instance's state (`getServerSnapshot`), useI18n() on the server
 * returns the locale and a working t(), `loading` follows the server state, a throwing tag
 * handler is not contained on the server. 0.7's ssrLocale / ssrInitial* props are gone:
 * the instance per request carries the locale, and <I18nHandover locale> renders a target.
 *
 * New in 1c (synthesis §4.4): the React 19 SSR smoke — rich text with element params and
 * nested tags renders with 0 React warnings (no missing key); two concurrent requests with
 * different locales over SHARED catalogs do not bleed (R4-12).
 */
import { renderToReadableStream, renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { version } from "react";
import { createI18n, I18nHandover, I18nProvider, T, useI18n, useLocale } from "../src";
import { useFormat } from "../src/format";
import { reactWarnings } from "./helpers";

const html = (s: string) => s.replace(/<!-- -->/g, "");

describe("SSR (renderToString)", () => {
  it("runs on React 19", () => expect(version.split(".")[0]).toBe("19"));

  it("renders the instance's locale and t() from the server snapshot", () => {
    const i18n = createI18n({ locale: "de", messages: { de: { hi: "Hallo {n}" } } });
    const Page = () => {
      const { t, locale, dir } = useI18n();
      return (
        <p lang={locale} dir={dir}>
          {t("hi", { n: "Ann" }) as string}
        </p>
      );
    };
    expect(
      html(
        renderToString(
          <I18nProvider i18n={i18n}>
            <Page />
          </I18nProvider>,
        ),
      ),
    ).toBe('<p lang="de" dir="ltr">Hallo Ann</p>');
  });

  it("renders the children on the server, never `loading` (lot 4b: the gate is a client's first paint)", () => {
    // A hydration renders the children too, so the server must: what it renders while a
    // catalog is still loading is the contract's text (the key), and the app preloads.
    const pending = createI18n({ locale: "en", loader: () => new Promise(() => {}) });
    const ready = createI18n({ locale: "en", messages: { en: { hi: "Hi" } } });
    const ui = (i: typeof ready, suspense?: boolean) => (
      <I18nProvider i18n={i} loading="wait" suspense={suspense}>
        <T i18nKey="hi" />
      </I18nProvider>
    );
    expect(renderToString(ui(pending))).toBe("hi");
    expect(renderToString(ui(pending, true))).toBe("hi");
    expect(renderToString(ui(ready))).toBe("Hi");
  });

  it("<I18nHandover locale> renders the target locale on the server and writes nothing", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi" }, uk: { hi: "Привіт" } } });
    const L = () => <>{useLocale()}</>;
    const out = renderToString(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="uk">
          <L />:<T i18nKey="hi" />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(html(out)).toBe("uk:Привіт");
    expect(i18n.locale).toBe("en");
  });

  it("rethrows a throwing tag handler on the server (no boundary)", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { m: "<x>a</x>" } } });
    expect(() =>
      renderToString(
        <I18nProvider i18n={i18n}>
          <T
            i18nKey="m"
            x={() => {
              throw new Error("handler failed");
            }}
          />
        </I18nProvider>,
      ),
    ).toThrow("handler failed");
  });

  it("React 19 smoke: rich text with element params and nested tags, 0 warnings", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: { m: "<b>Hi <i>{name}</i> {icon}</b>, {count, plural, one {# item} other {# items}}" },
      },
    });
    const warnings = await reactWarnings(() => {
      const out = renderToString(
        <I18nProvider i18n={i18n}>
          <T
            i18nKey="m"
            name="Ann"
            count={2}
            icon={<svg />}
            b={(c: React.ReactNode) => <b>{c}</b>}
            i={(c: React.ReactNode) => <i>{c}</i>}
          />
          {[1, 2].map((n) => (
            <T
              key={n}
              i18nKey="m"
              name={String(n)}
              count={n}
              icon={<svg />}
              b={(c: React.ReactNode) => <b>{c}</b>}
              i={(c: React.ReactNode) => <i>{c}</i>}
            />
          ))}
        </I18nProvider>,
      );
      expect(html(out)).toContain("<b>Hi <i>Ann</i> <svg></svg></b>, 2 items");
    });
    expect(warnings).toEqual([]);
  });

  it("two concurrent requests in different locales over shared catalogs do not bleed (R4-12)", async () => {
    const shared = { en: { hi: "Hello {n}" }, de: { hi: "Hallo {n}" } };
    const request = async (locale: string, n: string) => {
      const i18n = createI18n({ locale, messages: shared });
      await new Promise((r) => setTimeout(r, locale === "en" ? 5 : 0));
      return renderToString(
        <I18nProvider i18n={i18n}>
          <T i18nKey="hi" n={n} />
        </I18nProvider>,
      );
    };
    const [a, b] = await Promise.all([request("en", "A"), request("de", "B")]);
    expect([a, b]).toEqual(["Hello A", "Hallo B"]);
  });
});

describe("SSR: <I18nHandover locale> that is not a tag (lot 4d)", () => {
  /** Child bodies that ran: the refusal comes before the children. */
  let ran = 0;
  const OnlyT = () => {
    ran++;
    return <p>{useI18n().t("a")}</p>;
  };
  const OnlyFormat = () => {
    ran++;
    return <p>{useFormat().number(1)}</p>;
  };
  const Plain = () => {
    ran++;
    return <p>x</p>;
  };
  const Locale = () => <p>{useLocale()}</p>;
  const setup = () => {
    ran = 0;
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A" } } });
    return { i18n, set: vi.spyOn(i18n, "setLocale"), add: vi.spyOn(i18n, "add"), rev: i18n.rev() };
  };
  const page = (i18n: ReturnType<typeof createI18n>, bad: string, C: () => React.ReactNode) => (
    <I18nProvider i18n={i18n}>
      <I18nHandover locale={bad} catalogs={{ default: { de: { a: "A-de" } } }}>
        <C />
      </I18nHandover>
    </I18nProvider>
  );
  describe.each(["!!", ""])("locale=%j", (bad) => {
    describe.each([
      ["only t()", OnlyT],
      ["only useFormat()", OnlyFormat],
      ["a plain child", Plain],
    ] as const)("with %s", (_, C) => {
      const refused = (e: unknown, s: ReturnType<typeof setup>) => {
        expect(e).toBeInstanceOf(RangeError);
        // The handover's own error, not a child's formatter: the core's says `[@comvi/core]`.
        expect((e as Error).message).toBe(`[@comvi/react] invalid locale "${bad}"`);
        expect(ran).toBe(0);
        expect(s.set).not.toHaveBeenCalled();
        expect(s.add).not.toHaveBeenCalled();
        expect(s.i18n.rev()).toBe(s.rev);
      };
      it("renderToString throws a RangeError", () => {
        const s = setup();
        let e: unknown;
        try {
          renderToString(page(s.i18n, bad, C));
        } catch (x) {
          e = x;
        }
        refused(e, s);
      });
      it("a stream's shell rejects with a RangeError", async () => {
        const s = setup();
        const e = await renderToReadableStream(page(s.i18n, bad, C), { onError: () => {} }).catch(
          (x: unknown) => x,
        );
        refused(e, s);
      });
    });
  });

  it("a valid locale with no catalog renders as before: the key, no error", () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A" } }, onError });
    const out = renderToString(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="de">
          <Locale />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(html(out)).toBe("<p>de</p>");
    expect(i18n.locale).toBe("en");
    expect(onError.mock.calls.filter(([e]) => e.code == "invalid_locale")).toEqual([]);
  });
});
