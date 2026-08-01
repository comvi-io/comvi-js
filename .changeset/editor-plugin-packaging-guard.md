---
"@comvi/plugin-in-context-editor": patch
---

Packaging and production hardening for the in-context editor plugin. The bundled UI libraries (`vue`, `reka-ui`, `@vueuse/core`, `@lucide/vue`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`) moved from `dependencies` to `devDependencies` — they are compiled into `dist/index.es.js`, so installing the plugin no longer pulls them into your dependency tree. The full entry's plugin factory now also returns a no-op plugin at runtime when `NODE_ENV=production`, as a belt-and-suspenders guard for bundlers that ignore the `"production"` export condition (which already resolves to the lightweight stub). No API changes.
