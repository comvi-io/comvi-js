<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/core</h1>

<p align="center">The framework-agnostic runtime behind Comvi i18n: the i18n instance, <code>t()</code> and ICU messages.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=@comvi/core&amp;treeshake=%5B%7BcreateI18n%7D%5D"><img src="https://deno.bundlejs.com/badge?q=@comvi/core&amp;treeshake=%5B%7BcreateI18n%7D%5D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/core` is the i18n instance every Comvi binding builds on: it holds the catalogs and the
current locale, and `t()` renders ICU messages from them. Use it on its own in a server script, a
static site or Web Components; with a framework, install it beside the binding.

## Install

```bash
npm install @comvi/core
# Node 20 or newer. ESM only. No dependencies.
```

`@comvi/core` and every binding in an app must be on one version. With two copies of `@comvi/core`
nothing fails at import: an error that names both versions is thrown when an instance created by
one copy reaches code of the other (a binding, or `@comvi/core/format`).

## Create the i18n instance

```ts title="src/i18n.ts" check=group=core-1
import { createI18n } from "@comvi/core";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: {
      greeting: "Hello, {name}!",
      cart: "{count, plural, =0 {Your cart is empty} one {# item} other {# items}}",
    },
    uk: { greeting: "Привіт, {name}!" },
  },
});

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
i18n.t("cart", { count: 2 }); // "2 items"
```

`createI18n()` is synchronous: inline `messages` render on the next line, and there is no `init()`
to await. `messages` holds the `default` namespace by locale, written flat (`"account.title"`) or
nested (`{ account: { title } }`); both are the key `account.title`. A key with no message in the
locale or its fallback locales renders the key, and `onError` receives `missing_key`. Without a
`loader` the instance makes no request, so this file runs with no Comvi project and no account.

## Write messages

ICU MessageFormat is always on. These are the forms `t()` reads, rendered in `en`:

| Form                                   | Message                                                         | Params               | Renders            |
| -------------------------------------- | --------------------------------------------------------------- | -------------------- | ------------------ |
| `plural`, with `=N`, `offset:` and `#` | `{count, plural, =0 {No items} one {# item} other {# items}}`   | `{ count: 1234567 }` | `1,234,567 items`  |
| `selectordinal`                        | `{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` | `{ n: 22 }`          | `22nd`             |
| `select`                               | `{g, select, female {She} male {He} other {They}} replied`      | `{ g: "female" }`    | `She replied`      |
| Tag                                    | `Read the <link>terms</link>`                                   | a `link` handler     | `Read the [terms]` |
| Quoting                                | `Use '{name}' as is`                                            | none                 | `Use {name} as is` |

`#` is the one value a message formats for the locale. A plain `{x}` prints `String(value)`, so
`{year}` with `2026` stays `2026`. `{x, number}`, `{x, date}` and `{x, time}` are not part of the
syntax: such a message renders its key, and `onError` receives `syntax` with the hint "format it in
code with useFormat()". `useFormat()` is the bindings' hook. With the core alone, the same
formatters are functions of `@comvi/core/format` that take the instance first: format the value,
then pass the string as a plain param.

```ts title="src/total.ts" check=group=core-1
import { formatCurrency, formatDate } from "@comvi/core/format";
import { i18n } from "./i18n";

i18n.add("en", { total: "Total: {price}, due {due}", terms: "Read the <link>terms</link>" });

i18n.t("total", {
  price: formatCurrency(i18n, 1234.5, "USD"),
  due: formatDate(i18n, new Date(2026, 0, 2), { dateStyle: "medium" }),
}); // "Total: $1,234.50, due Jan 2, 2026"
i18n.t("terms", { link: (parts) => `[${parts.join("")}]` }); // "Read the [terms]"
```

The formatters are `formatNumber`, `formatCurrency`, `formatDate`, `formatDateRange`,
`formatRelativeTime`, `formatList` and `displayName`; each follows the instance's locale. A tag
handler receives the tag's content as a list of parts, and a tag with no handler renders its
content as text.

## Switch the locale

```ts title="src/switch.ts" check=group=core-1
import { i18n } from "./i18n";

const stop = i18n.on(() => {
  document.documentElement.lang = i18n.locale;
  document.querySelector("h1")!.textContent = i18n.t("greeting", { name: "Alice" });
});

await i18n.setLocale("uk"); // the listener runs, and i18n.locale is "uk"
stop();
```

`on(fn)` calls `fn` on every change the instance publishes (a switch, a catalog loaded or added)
and returns the function that unsubscribes; it takes no event name. `setLocale()` loads what the
new locale needs, keeps the current locale on screen meanwhile, then switches. It rejects, and the
locale stays, only when no namespace it waited for has a catalog for the new locale.

## Load catalogs

```ts title="src/i18n.ts" check=group=core-2
import { createI18n } from "@comvi/core";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  namespaces: ["default", "account"],
  loader: async (locale, ns) => {
    const module = await import(`./locales/${locale}/${ns}.json`);
    return module.default;
  },
  onError: (error) => console.warn(error.code, error.locale, error.ns, error.key),
});

await i18n.ready;
i18n.ns("account")("title");
```

The loader receives `(locale, ns, signal)` and returns the catalog itself. Return
`module.default`: a JSON module returned whole is a catalog with one key, `default`, so every
`t()` renders its key and the only report is `missing_key`. `i18n.ns("account")` is `t()` bound to
that namespace.

The first loads start inside `createI18n()`. `ready` resolves when the loads in flight have
settled, the failed ones too, and it never rejects: after a failed load `t()` still renders keys,
and `onError` has received `load_failed`. A binding's `isReady` answers the other question, whether
a catalog is in place for the locale on screen. With the core alone, ask `i18n.has(key)`, or
await `load()`, which rejects with the loader's error.

```ts title="src/billing.ts" check=group=core-2
import { i18n } from "./i18n";

await i18n.load("billing"); // after a failed load, calling it again calls the loader again
i18n.has("invoice.title", { ns: "billing" }); // true

await i18n.setLocale("uk");
await i18n.load("billing"); // load() does not follow a switch: ask again for the new locale
```

`setLocale()` reloads only the namespaces of the `namespaces` option, so await the switch first
and `load()` second ([the limit](https://comvi.io/docs/i18n/limitations#vanilla-load-and-switch)).
`t()` and `has()` only read: they never start a request.

## Load from Comvi

```ts title="src/i18n.ts" check=group=core-3
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>", {
    fallback: { en: () => import("./locales/en.json").then((module) => module.default) },
  }),
});
```

`cdn(base)` fetches `<base>/<locale>.json` for the `default` namespace and
`<base>/<ns>/<locale>.json` for the others. The URL comes from **Settings → Content Deploy** in
the Comvi project; the walkthrough is [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).
`fallback` is a spare for when the CDN does not answer, keyed by `"<locale>"` or
`"<locale>:<ns>"`. It is not a base the CDN lays over: while the CDN answers, a key that only the
spare has renders as a key. A server that creates an instance per request passes one
`createCatalogStore()` to every loader (`cdn(base, { store })`), so the requests share one fetch.

Do not put `messages` beside `loader` for the same catalog. An inline catalog switches off loading
for its pair of locale and namespace: with `messages: { en }`, the loader is never called for
`en` and `default`, not at the start and not by `load()`, and the same holds after `add()` created
the pair. The other namespaces of `en` and every other locale still load. The entry on the limits
page is [`messages` and `loader`](https://comvi.io/docs/i18n/limitations#messages-and-loader).

## Subpaths

| Import                 | What it gives you                                                                |
| ---------------------- | -------------------------------------------------------------------------------- |
| `@comvi/core`          | `createI18n`, `negotiate` and the types                                          |
| `@comvi/core/cdn`      | `cdn`, `createCatalogStore`, and `api` for a server that holds a project API key |
| `@comvi/core/format`   | The seven formatters                                                             |
| `@comvi/core/plugins`  | `detect` and `persist`, for the browser's locale                                 |
| `@comvi/core/ssr`      | `handover(i18n)`: the catalogs and clock a server render hands the browser       |
| `@comvi/core/devtools` | `devtools()`: lets the Comvi browser extension find the instance                 |

Plugins go in the `plugins` option: `plugins: [detect({ supported: ["en", "uk"] }), persist()]`.
`detect()` takes the first supported locale it finds in the `?lang=` query, the `comvi_locale`
cookie, `localStorage` or the browser's languages: with that locale's catalog inline the instance
starts in it, and when a `loader` has to fetch the catalog, `i18n.locale` is still the `locale`
option on the line after `createI18n()` and becomes the detected locale once the catalog is in, so
await `i18n.ready` first. `persist()` writes every switch to that cookie. `destroy()` aborts the
loads and drops the subscribers; a loaded catalog stays in the instance until then.

## Read next

- [Limitations](https://comvi.io/docs/i18n/limitations): what the library does not do, starting with
  [no `{x, number}` or `{x, date}`](https://comvi.io/docs/i18n/limitations#no-number-date-args),
  [relative time that does not tick](https://comvi.io/docs/i18n/limitations#relative-not-live) and
  [no unloading of catalogs](https://comvi.io/docs/i18n/limitations#no-unload).
- [Vanilla guide](https://comvi.io/docs/i18n/vanilla): update the DOM from `on()`, instance lifetime.
- [Core API reference](https://comvi.io/docs/i18n/api/core): every option and instance member.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate the `Catalogs` declaration so `t()` checks keys and params.
- [Upgrade to 0.8](https://comvi.io/docs/i18n/guides/upgrade-to-v08): each 0.7 form and what replaces it.

## Contributing

Bug reports, docs fixes and pull requests are welcome; the setup and what CI checks are in
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
