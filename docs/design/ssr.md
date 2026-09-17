# SSR: four frameworks, four different module-scope rules

Status: accepted · Date: 2026-09-14 · Owner decision(s): stays a user-facing page rather than a
decision record, and is the draft of the cross-framework SSR page for the site, 14.09.2026

Each package README states the rule for its own framework; this file is the only place all four sit
side by side, because the rules genuinely disagree and a reader who generalises from one gets the
next one wrong.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## The one question that decides everything

**May the host live at module scope on the server?**

A server process handles concurrent requests. The host holds a mutable `locale`. So the answer
depends on whether a request ever WRITES that locale, and each framework's SSR entry point answers
differently.

| framework   | host at module scope on the server | why                                                                                                               | how the request locale arrives                      |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Next.js** | **required**                       | `setI18n()` registers one instance per process and `getI18n()` resolves it; no request writes the locale          | passed explicitly to every `getI18n()` lookup       |
| **Nuxt**    | **forbidden**                      | the module builds a FRESH host per request through the host factory, and destroys it once the request is answered | nuxt's resolved `locale` option, per request        |
| **Solid**   | **forbidden**                      | adopting `ssrLocale` is a WRITE to `i18n.locale`, and `renderToString` runs it in the server process              | `ssrLocale` on `<I18nProvider>`                     |
| **Svelte**  | **forbidden**                      | a per-request instance built in `+layout.svelte` from `load` data; a `load` return value is serialized            | `data.locale` from the `load` function              |
| **React**   | either, if nothing writes          | plain react has no SSR entry of its own; the rule is the host framework's                                         | `ssrLocale` (or `ssrInitialLocale`) on the provider |
| **Vue**     | **forbidden**                      | a module-scope `createI18n(...)` is a singleton whose reactive `locale` ref moves under every concurrent render   | `ssrLocale` in the constructor options              |

Read that column again if you are porting an app between frameworks: **Next requires the shared
module-scope host that Solid, Svelte, Vue and Nuxt forbid.** It is the one place in this library
where the correct answer inverts.

## Who destroys the per-request host?

A host that goes out of scope is COLLECTED, which is not the same as DESTROYED. Collection frees the
catalog. It never runs a plugin's cleanup — an interval, a socket, a subscription stays alive until
someone calls `destroy()`. So on a long-lived server the question is who calls it.

- **`@comvi/nuxt`: the module does.** Its Nitro plugin destroys every host the request built, once
  the request is answered. Nothing to write.
- **Vue SSR, Solid, Svelte: your app does.** You build the instance in the request handler, so it is
  yours to tear down: `await i18n.destroy()` when the render is finished. The recipes below do it.
  Skip it only if you know your plugins hold nothing — the catalog is collected either way.
- **`@comvi/next`: nobody, by design.** The host is process-scoped and outlives every request.

## Next.js — one shared host, request locale passed explicitly

The instance contributes the catalog and the loader; the locale belongs to the request. Nothing a
request does writes the instance's locale or its active namespaces, which is what makes one shared
host safe. `setI18n(i18n)` registers it once per process and throws (in development and production)
on a second registration with a different instance, naming both sources.

That one host holds every catalog it ever loaded for the life of the process: a catalog is never
evicted (only the template, `Intl` and plural-rules caches are bounded, and by entry count, not by
bytes). A page set with a fixed number of locales and namespaces is therefore a bounded amount of
memory; a server that loads unbounded catalogs into it is not, and the shared host has no lifecycle
of its own to fix that. See [limitations.md](limitations.md#memory).

Full reasoning, including why the config module is evaluated twice and what must not reach the Edge
runtime, is in [next-runtimes.md](next-runtimes.md).

## Nuxt — a fresh host per request

The module calls your `comvi.host.ts` factory once per constructed instance: the app plugin, and
each per-request server instance. So the factory must return a FRESH host every call. The app plugin
runs in both bundles and adds `ssrLocale` so a server render and the hydrated client agree on the
render locale; the request-scoped Nitro host has no hydration to match and omits it — set it inside
the factory if a server route needs it.

SSR loading is the loader capability at work, so a server-rendered nuxt app composes a loader in
`comvi.host.ts`. Without one, the server utilities say so once, by name, and render whatever the
catalog already holds. They never call a member the host does not have.

**The request host is destroyed once the request is answered.** The module registers a Nitro server
plugin that destroys every locale instance that request built, so a plugin's cleanup runs once per
request instead of never.

The plugin listens through Hookable's `afterEach` rather than as a named `afterResponse` handler: a
named handler runs in the middle of the call, where a LATER handler (another module's, or Nitro's
own background-refresh registration) has not yet called `event.waitUntil()`. A `destroy()` that fails is
reported through the host's `onError` with source `"request-cleanup"`, never thrown into a response
that has already been sent.

`afterResponse` and not the response's `close` event, because `close` says only that the socket is
gone. On a client abort that is true **while the handler may still be rendering**, and a destroyed
host renders missing keys — which a `defineCachedEventHandler` or an `swr` / `isr` route would then
write into the cache and serve to everyone. `afterResponse` means both "the handler returned" and
"the response is written".

It is not the only signal needed, because neither hook means "nothing else will use this event":

- **A thrown handler never reaches `afterResponse`.** h3's catch runs `onError` first, and Nitro's
  error handler sends the response there, so h3 returns on `event.handled` before it would have
  called `afterResponse`. The `error` hook is the only signal such a request gives.
- **`error` is Nitro's `captureError`, and fires on requests that keep running** —
  `event.captureError()`, a `request` hook that throws and is swallowed, a cache read or write
  failure. So that path does not schedule anything: it waits for the response to actually end
  (`finish`, or `close` for a request that never finishes). Nitro captures before it sends, so
  `finish` is exactly when the error response went out.
- **`afterResponse` fires while background work still holds the event.** `event.waitUntil(promise)`
  is the documented way to keep working after responding, and a cached handler registers its
  stale-while-revalidate refresh through that same mechanism, running it with the PARENT event's
  context — the very key teardown is filed under. So teardown first awaits the event's pending
  `waitUntil` promises, and every path to teardown goes through that wait, including a captured
  error that arrives after the response has ended. That list is `context.nitro._waitUntilPromises`,
  which nitropack 2.13.4 exposes through no public accessor, so it is read defensively: a missing or
  non-array field simply means there is nothing to wait for. A task that REJECTS delays nothing.

Two limits are worth knowing. **The wait follows work that registers more work, for 100 rounds.**
Past that the hosts are destroyed anyway and the host's `onError` is told, with source
`"request-cleanup"` and the round count: a background task that reschedules itself forever would
otherwise pin that request's hosts, which is the leak this mechanism exists to close. **On a web
preset the teardown is best effort.** It runs as a continuation after `afterResponse` returns, and a
platform that suspends the isolate the moment the `Response` is handed back — Cloudflare, Deno
Deploy — may never run it. Node presets do guarantee it. Registering the teardown itself through
`event.waitUntil` would fix that and deadlock the wait against itself, so the honest statement is
this sentence rather than a mechanism.

**Without Nitro** — a bare h3 app embedding these utilities — there is no such hook, so the
fallback is `close` after all: a response that ENDED is torn down immediately, and an ABORTED one
waits either for the response to end after all or for one macrotask, whichever comes first, so a
handler whose remaining work is microtasks finishes first. **The residual race:** a handler that
yields to a timer or to real I/O after an abort can still have its hosts destroyed under it. What it
cannot do is get a silently half-dead host — the next `useTranslation()` / `loadTranslations()` on a
torn-down request throws, naming the situation, because the response is gone and there is nothing
left to translate for.

## Vue — build the instance in the request handler

**Build one instance per request.** A module-scope `createI18n(...)` is a singleton shared by every
concurrent request, and its locale is mutable: one visitor switching to `uk` moves the locale (and
the reactive `locale` ref) under everyone else's render.

**Pass the request locale as `ssrLocale`**, not as `locale`: it reaches the core before the reactive
ref is seeded, so the ref and `core.locale` agree on the very first render and the client hydrates
against the same locale it was served.

**`await i18n.init()` before `renderToString`.** `app.use(i18n)` starts `init()` fire-and-forget,
which is a client-side convenience; on the server that races translation loading and can serialize
an empty cache.

**`await i18n.destroy()` when the render is done.** The instance is this request's, so its teardown
is this request's too — `destroy()` resolves once the plugin cleanups have finished. Dropping the
reference instead collects the catalog but leaves a plugin's interval or socket running.

```ts title="server.ts"
// One instance per request.
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

export async function render(localeFromRequest: string) {
  const app = createSSRApp(App);
  const i18n = createI18n({
    locale: "en",
    ssrLocale: localeFromRequest,
    translation: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } },
  });

  app.use(i18n);
  await i18n.init();

  try {
    return await renderToString(app);
  } finally {
    // This host belongs to this request. Nothing in the library destroys it.
    await i18n.destroy();
  }
}
```

## Solid — a host per request, and no initialization on the server

A catalog the host already holds — an inline `translation` map — renders during `renderToString`, and
`ssrLocale` is how the server render and the hydrating client agree on which locale that is. Adopting
the locale is a WRITE to `i18n.locale`, so the host is built inside the request handler.

What does **not** happen on the server is initialization: `<I18nProvider>` calls `init()` from a
`createEffect` (the `createEffect` inside `I18nProvider`, `packages/solid/src/context.tsx`), and effects do not run during Solid's
server render. So a catalog a loader would have fetched is absent server-side, and
`isInitialized()` is `false` there. **Server-side loading is not supported yet.** With SolidStart or
another SSR setup, keep the catalog inline for the server render, or load on the client and gate the
UI with `fallback` — knowing the gate is closed on the server too, so the page ships the fallback and
swaps once the client host initializes.

```tsx title="src/entry-server.tsx"
// One host per request.
import { renderToString } from "solid-js/web";
import { createI18n, I18nProvider, icuCompiler } from "@comvi/solid";
import en from "./locales/en.json";
import uk from "./locales/uk.json";
import App from "./App";

export async function render(locale: string) {
  const i18n = createI18n({
    locale,
    compiler: icuCompiler,
    translation: { "en:default": en, "uk:default": uk },
  });

  try {
    return renderToString(() => (
      <I18nProvider i18n={i18n} ssrLocale={locale}>
        <App />
      </I18nProvider>
    ));
  } finally {
    // This host belongs to this request. Nothing in the library destroys it.
    await i18n.destroy();
  }
}
```

Pass `ssrLocale` on the client too. Without it the client keeps its own locale, the hydrated markup
stays in the server's locale until the first reactive update, and then the text flips.

## Svelte (SvelteKit) — per-request instance, serializable data only

Create a **per-request** i18n instance. Never share a module-level singleton across requests, or one
user's locale bleeds into another's response.

A `load` function's return value crosses the server→client boundary and is serialized with `devalue`,
so it must **not** return the i18n instance itself: a class instance cannot be serialized and
SvelteKit throws. Return plain data and build the instance in the component, which runs once per
request on the server and once on the client.

```ts title="src/routes/+layout.ts"
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch }) => {
  const locale = "en";
  // Plain JSON, safe to serialize to the client.
  const messages = await fetch(`https://cdn.comvi.io/your-distribution-id/${locale}.json`).then(
    (r) => r.json(),
  );
  return { locale, messages };
};
```

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import type { TranslationValue } from "@comvi/core";
  import type { Snippet } from "svelte";

  let { data, children }: {
    data: { locale: string; messages: Record<string, TranslationValue> };
    children: Snippet;
  } = $props();

  // Per-request instance built from serializable load data — never a module singleton.
  // Seeded synchronously so translations are ready before the first render (no flash,
  // no hydration mismatch); the browser auto-init microtask would not complete in time.
  const i18n = createI18n({
    locale: data.locale,
    translation: { [data.locale]: data.messages },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

Child components call `useI18n()` as normal, and the context carries the per-request instance.

The server-side instance is yours to destroy. A `+layout.svelte` has no "render finished" hook to
hang that on, so do it where the response is assembled — a `handle` hook in `src/hooks.server.ts`
that builds the host, puts it in `event.locals`, and `await i18n.destroy()`s it after `resolve()` —
or skip it knowingly, if your plugins hold nothing. See
[Who destroys the per-request host?](#who-destroys-the-per-request-host) above.

Prefer the runtime CDN/API loader for client navigation? Keep the per-request
`createI18n(...).use(cdnLoader(...))` in `+layout.svelte` and `await i18n.init()` inside an
`$effect` / `onMount` for the client, while still seeding `translation` from `load` data for the
initial server render. The rule is the same: only serializable data crosses `load`.

## React — two props, and the gate defaults open

React has no SSR entry of its own; whichever framework renders it sets the module-scope rule. What
react contributes is the pair of props that make a server render and its hydration agree.

- **`ssrLocale`** is the locale the server snapshot renders in. `ssrInitialLocale` is react's
  original name for the same prop, kept as a legacy alias: when both are passed `ssrLocale` wins —
  the canonical name should not lose to the alias it replaces — and a development build warns that
  it did. Prefer `ssrLocale` — it is the name `@comvi/vue`,
  `@comvi/solid` and `@comvi/nuxt` use, so one shared SSR layer passes one name to every binding.
  `@comvi/next` takes the render locale from its own `locale` prop and accepts neither.
- **`ssrInitialIsInitializing`** decides whether the server render is gated by `fallback`, and it is
  `false` by default. A server render is therefore never gated, and because the hydration render
  reads that same snapshot, the hydrated markup matches before the gate re-applies on the client.

That default is the right one for a page whose server render already produced real text: gating it
would replace correct content with a spinner until the client host initializes. It is the wrong one
for a server render that has no catalog yet, whose markup would ship raw keys — there, pass
`ssrInitialIsInitializing={true}` alongside `fallback`, and the fallback is what the server paints,
what hydration reuses, and what the children replace once the client host initializes.

The gate's axis is `isInitialized`, deliberately not `isInitializing`: `init()` starts from an
effect, after the first render, so a gate on "is it initializing" is open for exactly the frame the
raw keys would paint in.

## Ambient tags must be imported in the server graph too

`import "@comvi/core/tags"` registers the tag grammar process-wide, per bundle. An SSR app has two
bundles. Import it in both, or the same string renders literally on the server and with markup on
the client. See [rich-text.md](rich-text.md).

## Related

- [Composition](composition.md) · [Next.js runtimes](next-runtimes.md) ·
  [Limitations](limitations.md)
