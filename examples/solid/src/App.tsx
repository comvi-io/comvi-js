import { createEffect, createSignal, For, Show } from "solid-js";
import { T, useI18n } from "@comvi/solid";
import { locales } from "./i18n";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function App() {
  // `useI18n()` builds its signals from the provider's, so it MUST be called
  // inside a component (a reactive context) — never at module scope.
  const {
    t,
    locale,
    setLocale,
    dir,
    isLoading,
    cacheRevision,
    formatNumber,
    formatDate,
    getLoadedLocales,
  } = useI18n();
  const [count, setCount] = createSignal(2);

  createEffect(() => {
    document.documentElement.lang = locale();
    document.documentElement.dir = dir();
  });

  return (
    <main>
      <h1>{t("app.title")}</h1>

      {/* 1 — locale switcher */}
      <section>
        <h2>{t("app.language")}</h2>
        <div class="row">
          <For each={locales}>
            {(code) => (
              <button aria-pressed={locale() === code} onClick={() => void setLocale(code)}>
                {code}
              </button>
            )}
          </For>
          <Show when={isLoading()}>
            <code>{t("app.loading")}</code>
          </Show>
        </div>
      </section>

      {/* 2 — a string with a parameter */}
      <section>
        <h2>interpolation</h2>
        <p>{t("greeting.hello", { name: "Ada" })}</p>
      </section>

      {/* 3 — an ICU plural, live on a counter */}
      <section>
        <h2>plural</h2>
        <div class="row">
          <button onClick={() => setCount((n) => Math.max(0, n - 1))}>−</button>
          <button onClick={() => setCount((n) => n + 1)}>+</button>
          <span>{t("cart.items", { count: count() })}</span>
        </div>
      </section>

      {/* 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
          what that renders as. The tag grammar travels per call, so plain
          `t()` elsewhere is unaffected. */}
      <section>
        <h2>tag interpolation</h2>
        <p>
          <T
            i18nKey="docs.read_more"
            components={{
              link: {
                tag: "a",
                props: { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
              },
            }}
          />
        </p>
      </section>

      {/* 5 — date and number formatting. The formatters take the locale as
          their last argument; passing `locale()` is what subscribes this
          expression to a locale change. */}
      <section>
        <h2>formatting</h2>
        <p>
          {t("stats.summary", {
            views: formatNumber(1234567, undefined, locale()),
            date: formatDate(RELEASED, { dateStyle: "long" }, locale()),
          })}
        </p>
      </section>

      {/* 6 — proof the loader is lazy: only the locales you visited are here.
          `getLoadedLocales()` is a plain call, so read `cacheRevision()` to
          depend on the catalog landing. */}
      <section>
        <h2>lazy loading</h2>
        <p>
          <code>
            {(() => {
              void cacheRevision();
              return t("loader.fetched", { locales: getLoadedLocales().join(", ") });
            })()}
          </code>
        </p>
      </section>
    </main>
  );
}
