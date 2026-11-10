// `withComvi(options)` with options widened to `WithComviOptions` may carry `types`, and then
// returns the function form at runtime: its result must not type as a plain object config
// (a downstream plugin that spreads it would lose the config and the generation). Literal
// options without `types` keep returning `NextConfig` for an object config.
import type { NextConfig } from "next";
import { withComvi, type NextConfigFn, type WithComviOptions } from "../../src/plugin";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const widened: WithComviOptions;
const maybe = withComvi(widened)({ reactStrictMode: true });
type _widened = Expect<Equal<typeof maybe, NextConfig | NextConfigFn>>;
// A downstream plugin for an object config (it spreads what it gets).
declare const objectPlugin: (config: NextConfig) => NextConfig;
// @ts-expect-error -- the widened call may return the function form: not an object config.
objectPlugin(maybe);
// @ts-expect-error -- the same for a plain assignment.
const asObject: NextConfig = maybe;

const plain = withComvi()({ reactStrictMode: true });
type _plain = Expect<Equal<typeof plain, NextConfig>>;
const literal = withComvi({})({ reactStrictMode: true });
type _literal = Expect<Equal<typeof literal, NextConfig>>;
objectPlugin(plain);

const typed = withComvi({ types: { from: "./src/locales" } })({ reactStrictMode: true });
type _typed = Expect<Equal<typeof typed, NextConfigFn>>;

export { asObject, literal, typed };
