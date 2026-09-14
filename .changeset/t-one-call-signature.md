---
"@comvi/core": patch
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

`t` and `tRaw` now have ONE signature. The key parameter is `AcceptedKey`, the union of every key
the registry knows, and `ArgsFor` dispatches the params on the key that was passed, so TypeScript
names the actual problem:

| the mistake                   | before                             | now                                                |
| ----------------------------- | ---------------------------------- | -------------------------------------------------- |
| unknown key                   | TS2769, 7 lines                    | TS2345, 1 line, naming the declared keys           |
| required param forgotten      | TS2345 "not assignable to `null`"  | TS2554 "Expected 2 arguments, but got 1"           |
| wrong params                  | TS2769, 8 lines                    | TS2345, 2 lines, the second naming what is missing |
| wrong param value             | TS2769, 7 lines                    | TS2322, 1 line                                     |
| bare key of another namespace | TS2345 "not assignable to `never`" | TS2554 "Expected 2 arguments, but got 1"           |

Nothing that compiled before stops compiling, and nothing that was rejected is now accepted: the
key sets, the namespace-bound narrowing of `useI18n(ns)`, the `{ ns }` form, the qualified
`"ns:key"` spelling on the core instance, the `t(null)` no-op, and the permissive path for a
project with no generated types are all unchanged. `TranslationKeys`, `Namespaces`,
`NamespacedKeys`, `DefaultNsKeys`, `PermissiveKey`, `ParamsArg`, `NamespacedParamsArg`,
`NamespaceBoundParamsArg` and `MissingParams` keep their meaning; `AcceptedKey`, `AcceptedCoreKey`
and `ArgsFor` are new exports.

`@comvi/next`'s `TranslationFunction`, `@comvi/nuxt`'s `ServerTranslationFunction` and
`@comvi/vue`'s `VueI18n.t` / `tRaw` declared their own copies of the overload set and now declare
the single signature instead. Their names and behaviour are unchanged.

Also fixed in `@comvi/nuxt`: `useTranslation`'s server `t` passed its runtime string key straight
to core, which does not type-check once an app generates types. It now uses the `as never` escape
hatch every binding's `<T>` already uses. Type-level only — the call was always correct at runtime.
