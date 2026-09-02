// `src/types.ts` augments `@nuxt/schema` (it adds `comvi` to NuxtConfig,
// NuxtOptions and both runtime configs). A module augmentation cannot pull its
// target into the program on its own: the module has to be there already, via
// a real import from some file the project includes. `tsconfig.runtime.json`
// compiles only `src/types.ts` and `src/runtime/**`, and nothing in that set
// imports `@nuxt/schema` — `src/module.ts` is the only file that does, and it
// is not in that project — so the augmentation reported TS2664.
//
// This file is what makes the module present. It used to be a
// `declare module "@nuxt/schema" { … }` block of four EMPTY interfaces inside
// `src/shims-nuxt.d.ts`. That file is a global script, so the block was an
// ambient module DECLARATION that SHADOWED the real package rather than
// augmenting it: `@nuxt/kit`'s own declarations resolved through the stub, so
// `defineNuxtModule` and `extendPages` degraded to `any` and `src/module.ts`
// could not be type-checked at all. The `export {}` below is load-bearing —
// it makes this file a module, so nothing here can shadow anything.
import type {} from "@nuxt/schema";

export {};
