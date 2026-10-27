/**
 * <I18nProvider> (design §3.4). Ported by meaning from 0.7 I18nProvider.test.tsx: context
 * for the subtree, re-render on every published change, the instance prop swapped, no
 * update after unmount, a hook outside a provider. 0.7's autoInit / init() / onError-of-init
 * / ssrInitial* props are gone with init() (the constructor is synchronous and starts the
 * loads; `loading` and `suspense` replace `fallback`).
 */
import { Suspense, useState, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, useI18n, useLocale, type I18n } from "../src";
import { make, manualLoader, settle } from "./helpers";

const Show = ({ k = "hi", p }: { k?: string; p?: Record<string, unknown> }) => {
  const { t, locale } = useI18n();
  return <p>{`${locale}:${t(k, p) as string}`}</p>;
};

const app = (i18n: I18n, children: ReactNode = <Show />, extra = {}) => (
  <I18nProvider i18n={i18n} {...extra}>
    {children}
  </I18nProvider>
);

describe("<I18nProvider>", () => {
  it("gives its subtree the instance: t() renders at once from bundled messages", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hello, {name}!" } } });
    render(app(i18n, <Show p={{ name: "Ann" }} />));
    expect(screen.getByText("en:Hello, Ann!")).toBeTruthy();
  });

  it("re-renders its consumers on every published change: setLocale, add, setDefaultParams", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hi {who}" }, de: { hi: "Hallo {who}" } },
      defaultParams: { who: "you" },
    });
    const { container } = render(app(i18n));
    expect(container.textContent).toBe("en:Hi you");
    await act(() => i18n.setLocale("de"));
    expect(container.textContent).toBe("de:Hallo you");
    act(() => i18n.add("de", { hi: "Servus {who}" }));
    expect(container.textContent).toBe("de:Servus you");
    act(() => i18n.setDefaultParams({ who: "Ann" }));
    expect(container.textContent).toBe("de:Servus Ann");
  });

  it("follows a new i18n prop: renders and subscribes to the new instance only", async () => {
    const a = createI18n({ locale: "en", messages: { en: { hi: "A" } } });
    const b = createI18n({ locale: "en", messages: { en: { hi: "B" } } });
    let swap!: () => void;
    const Root = () => {
      const [i, set] = useState(a);
      swap = () => set(b);
      return app(i);
    };
    const { container } = render(<Root />);
    expect(container.textContent).toBe("en:A");
    act(() => swap());
    expect(container.textContent).toBe("en:B");
    act(() => a.add("en", { hi: "A2" }));
    expect(container.textContent).toBe("en:B");
    act(() => b.add("en", { hi: "B2" }));
    expect(container.textContent).toBe("en:B2");
  });

  it("releases its subscription on unmount: a later publish renders nothing", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hello" } } });
    let renders = 0;
    const Count = () => {
      renders++;
      return <Show />;
    };
    const view = render(app(i18n, <Count />));
    view.unmount();
    const before = renders;
    act(() => i18n.add("en", { hi: "Later" }));
    expect(renders).toBe(before);
  });

  it("development: a hook outside a provider throws a [@comvi/react] error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Show />)).toThrow(/^\[@comvi\/react\] no <I18nProvider>/);
    expect(() => render(<p>{useLocaleOutside()}</p>)).not.toThrow();
    err.mockRestore();
  });
});

/** useLocale() outside a provider is the empty locale (a context default), not a throw. */
const useLocaleOutside = () => {
  const Probe = () => <>{useLocale() || "none"}</>;
  return <Probe />;
};

describe("<I18nProvider loading>", () => {
  it("renders `loading` while a catalog of the current locale loads, then the children", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    const { container } = render(app(i18n, <Show />, { loading: <i>wait</i> }));
    expect(container.textContent).toBe("wait");
    await l.answer("en:default");
    expect(container.textContent).toBe("en:Hello");
  });

  it("renders the children after a failed load (the failure is reported, not a spinner forever)", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    const { container } = render(app(i18n, <Show />, { loading: "wait" }));
    await l.fail("en:default");
    expect(container.textContent).toBe("en:hi");
    expect(errors.map((e) => e.code)).toContain("load_failed");
  });

  it("keeps the old locale on screen while a switch loads (only the current locale gates)", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" } });
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hello" } }, loader: l.load });
    const { container } = render(app(i18n, <Show />, { loading: "wait" }));
    let switched!: Promise<void>;
    act(() => void (switched = i18n.setLocale("de")));
    expect(container.textContent).toBe("en:Hello");
    await l.answer("de:default");
    await act(() => switched);
    expect(container.textContent).toBe("de:Hallo");
  });

  it("renders the children while loading when no `loading` is given (missing keys are not reported)", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    const { container } = render(app(i18n));
    expect(container.textContent).toBe("en:hi");
    expect(errors).toEqual([]);
    await l.answer("en:default");
    expect(container.textContent).toBe("en:Hello");
  });
});

describe("<I18nProvider suspense>", () => {
  it("suspends on i18n.ready while the current locale loads, then renders", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    const { container } = render(
      <Suspense fallback="fallback">{app(i18n, <Show />, { suspense: true })}</Suspense>,
    );
    expect(container.textContent).toBe("fallback");
    await l.answer("en:default");
    expect(container.textContent).toBe("en:Hello");
  });

  it("throws the SAME promise on every render while the loads are in flight, and none after", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    // React subscribes (`then`) to what the provider throws: record the promise objects it
    // subscribes to. `ready` hands out one Tracked wrapper per underlying promise, so a
    // provider that throws `ready` itself is seen as ONE object; one that throws a derived
    // promise (a `then()` per render) is seen as several.
    const thrown = new Set<unknown>();
    let calls = 0;
    class Tracked<T> extends Promise<T> {
      override then<A = T, B = never>(
        y?: ((v: T) => A | PromiseLike<A>) | null,
        n?: ((e: unknown) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        thrown.add(this);
        calls++;
        return super.then(y, n);
      }
    }
    const wrapped = new Map<unknown, Promise<void>>();
    const ready = Object.getOwnPropertyDescriptor(i18n, "ready")!.get!;
    Object.defineProperty(i18n, "ready", {
      get: () => {
        const p = ready.call(i18n) as Promise<void>;
        if (!wrapped.has(p)) wrapped.set(p, new Tracked<void>((y) => p.then(y)));
        return wrapped.get(p);
      },
    });
    let bump!: () => void;
    const Parent = () => {
      const [n, set] = useState(0);
      bump = () => set(n + 1);
      return (
        <Suspense fallback="fallback">
          {app(i18n, <Show />, { suspense: true, key: "p" })}
          <i>{n}</i>
        </Suspense>
      );
    };
    const { container } = render(<Parent />);
    act(() => bump());
    act(() => bump());
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(thrown.size).toBe(1);
    await l.answer("en:default");
    expect(container.textContent).toBe("en:Hello2");
    const after = calls;
    act(() => bump());
    act(() => bump());
    // A re-render after the loads settled does not suspend again.
    expect(calls).toBe(after);
    expect(container.textContent).toBe("en:Hello4");
  });

  it("does not suspend for a locale switch in flight (the old locale stays on screen)", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" } });
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hello" } }, loader: l.load });
    const { container } = render(
      <Suspense fallback="fallback">{app(i18n, <Show />, { suspense: true })}</Suspense>,
    );
    act(() => void i18n.setLocale("de"));
    expect(container.textContent).toBe("en:Hello");
    await l.answer("de:default");
    await settle();
    expect(container.textContent).toBe("de:Hallo");
  });
});
