---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Generated types now augment the Comvi package your app declares, so a one-package install gets working keys. The declaration used to augment `@comvi/core` unconditionally, but the documented install adds only a framework binding and core arrives through it as a transitive dependency — under pnpm's strict layout or Yarn PnP the app cannot resolve it, the augmentation attached to nothing, TypeScript reported TS2882 on the generated import, and `skipLibCheck: true` hid that while every unknown key type-checked.

The target is read from your `package.json`: `@comvi/core` when you declare it, otherwise `@comvi/react`, `@comvi/next`, `@comvi/vue`, `@comvi/nuxt`, `@comvi/svelte` or `@comvi/solid`. The generated header names it. Nothing extra to install, and nothing is resolved from `node_modules`, so the answer is the same on every machine and `comvi typegen --check` regenerates the same file the write path produced. Declare none of them and both tools refuse instead of writing an inert file. Set `augment` in `.comvirc.json`, or the `augment` plugin option, to name another module such as a private wrapper package that re-exports a binding.

The rule reads the `dependencies` and `devDependencies` of that one `package.json`. Declaring the package in a workspace root or under `peerDependencies` is not enough: the app's own manifest must list it, or `augment` must name the module. If your app relied on a hoisted copy it never declared, generation now fails until you add it — which is the dependency you were already importing.

Regenerate once after upgrading: the header line changed and `--check` compares it.
