# Watchdog notes — comvi js-sdk

This is a published OSS library; the public API surface is the product. Especially watch for:

- **Breaking changes** to exported types or runtime behavior of published packages without the required bump changeset. Policy (owner-clarified 2026-08-02): while packages are **0.x**, breaking changes ride **minor** bumps (0.5 → 0.6) — standard pre-1.0 semver practice — and MUST carry explicit migration notes in the changeset. From **1.0.0 onward**, breaking requires a **major**-bump changeset (1.x → 2.0).
- **Missing changesets**: user-visible package changes with no `.changeset/*.md` entry.
- **Core bloat**: new dependencies or non-tree-shakeable code in `packages/core` (size budgets in `scripts/size-budgets.json`).
- **Parity drift**: `core` behavior changes not mirrored across all framework bindings (vue/react/solid/svelte/next/nuxt).
- **SSR breakage**: browser globals (`window`, `document`, `navigator`) referenced at module top level in packages used server-side.
- **Type-safety regressions**: `any` leaking into public types, weakened generics on translate functions.
- **Hand-edited `package.json` exports** without the contract checks being run.
