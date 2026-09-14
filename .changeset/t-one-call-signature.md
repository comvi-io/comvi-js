---
"@comvi/core": minor
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/vue": patch
---

`t()` reports a wrong call on the first line: one call signature instead of three overloads. No
runtime change.

With typed keys generated, every mistake used to open with TS2769 "No overload matches this call"
followed by the failure of each overload in turn, and the one useful line came last. A forgotten
required parameter was worse — "Argument of type '\"welcome\"' is not assignable to parameter of
type 'null'" — because the only overload that accepted a single argument was the permissive one,
whose key parameter is `never` once the registry is closed.

`t` and `tRaw` now have ONE signature. The key parameter is `AcceptedKey`, the union of the keys
that call site may use, and `ArgsFor` dispatches the params on the key that was passed, so
TypeScript names the actual problem:

| the mistake                   | before                             | now                                                |
| ----------------------------- | ---------------------------------- | -------------------------------------------------- |
| unknown key                   | TS2769, 7 lines                    | TS2345, 1 line, naming the declared keys           |
| required param forgotten      | TS2345 "not assignable to `null`"  | TS2554 "Expected 2 arguments, but got 1"           |
| wrong params                  | TS2769, 8 lines                    | TS2345, 2 lines, the second naming what is missing |
| wrong param value             | TS2769, 7 lines                    | TS2322, 1 line                                     |
| bare key of another namespace | TS2345 "not assignable to `never`" | TS2345, naming the keys the call site can use      |

The last row is why the key union depends on the namespace in scope rather than holding every
namespace's bare keys. A bare key is only meaningful next to the namespace that declares it, and
there are two ways to supply one: `useI18n("admin")` binds it at the call site, and an explicit
`{ ns: "shop" }` names it in the params. So `useI18n("admin").t("checkout")` is rejected on the KEY,
naming `admin`'s keys, while `t("checkout", { ns: "shop" })` compiles unchanged.

The key sets, the namespace-bound narrowing of `useI18n(ns)`, the `{ ns }` form, the qualified
`"ns:key"` spelling on the core instance, the `t(null)` no-op, a runtime `ns`, and the permissive
path for a project with no generated types all behave exactly as before. `TranslationKeys`,
`Namespaces`, `NamespacedKeys`, `DefaultNsKeys`, `PermissiveKey`, `ParamsArg`,
`NamespacedParamsArg`, `NamespaceBoundParamsArg` and `MissingParams` keep their meaning.
`AcceptedKey`, `AcceptedCoreKey` and `ArgsFor` are new exports, which is why this is a minor.

Three type-level shapes DO change, all of them consequences of there being one signature rather
than an overload set that could instantiate its key parameter to `string`. All three are listed in
`docs/design/limitations.md`.

A **union key** — `t(cond ? "greeting" : "farewell")` — now gets loose params and compiles, where
the overload set rejected it against the permissive overload's `null` key. The key is still
checked; the params are not. Closing it needs the arms' params intersected, and that costs the
check on `t("key", { ns })`, which would silently accept a wrong namespace.

**`Parameters<typeof t>` is `never`** with a closed registry, where it used to be the permissive
overload's tuple. The key parameter's type depends on a second, inferred type parameter and
`Parameters` cannot see through that. Reach the argument list through `ArgsFor<"your.key">`, which
resolves normally.

**`t` is no longer assignable to a `(key: string) => string` callback** with a closed registry —
the common "hand `t` to a third-party helper" shape. Cast it: `t as (k: string) => string`. The
two-argument variant never accepted `t`.

`@comvi/next`'s `TranslationFunction`, `@comvi/nuxt`'s `ServerTranslationFunction` and
`@comvi/vue`'s `VueI18n.t` / `tRaw` declared their own copies of the overload set and now declare
the single signature instead. Their names and behaviour are unchanged.

`createBoundTranslation(i18n, ns)` threads `ns` into its RETURN type, so the result narrows to that
namespace's keys — `createBoundTranslation(i18n, "admin")("dashboard")` compiles, which is what its
own `@example` documents. Bind the namespace with a literal; a `string` variable leaves the result
unbound and loose, as a runtime namespace always was.

Also fixed in `@comvi/nuxt`: `useTranslation`'s server `t` passed its runtime string key straight
to core, which does not type-check once an app generates types. It now uses the `as never` escape
hatch every binding's `<T>` already uses. Type-level only — the call was always correct at runtime.
