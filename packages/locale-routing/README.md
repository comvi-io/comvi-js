<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/locale-routing</h1>

<p align="center">Internal locale-routing primitives shared by <code>@comvi/next</code> and <code>@comvi/nuxt</code>.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/locale-routing"><img src="https://img.shields.io/npm/v/@comvi/locale-routing?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

> **Not for direct use.** This package is published only because
> [`@comvi/next`](https://www.npmjs.com/package/@comvi/next) and
> [`@comvi/nuxt`](https://www.npmjs.com/package/@comvi/nuxt) depend on it at
> runtime. It is an internal seam: its exports carry no compatibility promise
> and can change in any release.
>
> The public routing API is `@comvi/next/routing` for Next.js, and the Nuxt
> module's own composables for Nuxt. Reach for those.

## Install

You do not install this package. It arrives as a dependency of the framework
package you already install:

```bash
npm install @comvi/next   # or @comvi/nuxt
```

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
