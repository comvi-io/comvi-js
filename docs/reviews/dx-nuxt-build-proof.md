# DX-Nuxt build proof (N1–N3)

Branch `feat/dx-nuxt`, base `feat/weight-refactor-0.5` @ 85a85d47. Recorded 2026-10-04.

|                                                              | Version               |
| ------------------------------------------------------------ | --------------------- |
| Node                                                         | v24.19.0              |
| pnpm                                                         | 9.12.1                |
| Nuxt, docs probe scaffold (`create-nuxt --template minimal`) | ^4.5.2                |
| Nuxt, `examples/nuxt`                                        | ^4.5.2                |
| Nuxt, `test-apps/nuxt` build                                 | 3.21.4 (Nitro 2.13.4) |

Platform docs source: `origin/develop` @ e3b4ed6d, `quick-start.mdx` and `connect-comvi.mdx`,
copied to a scratch directory. "proposed" is that copy with the Nuxt fences replaced by the
trimmed config and `defineComviHost`.

## Commands

```bash
pnpm docs:quickstart --content <scratch>/current --only nuxt     # red: plugin head call stubbed out
pnpm docs:quickstart --content <scratch>/proposed --only nuxt    # green
pnpm examples:e2e --only nuxt                                    # red: plugin head call stubbed out
pnpm examples:e2e --only nuxt                                    # green
pnpm examples:e2e --only nuxt --cdn --no-build --no-pack         # green
```

## Docs probe, red (current docs, no `comvi.head`)

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| nuxt      | quick-start   | pass     | pass    | pass  | pass      | fail   |
| nuxt      | connect-comvi | pass     | pass    | pass  | pass      | fail   |

First failing line per step:
- nuxt / quick-start / render: error: server HTML at http://127.0.0.1:50237/ has <html>, expected lang="en"
- nuxt / connect-comvi / render: error: server HTML at http://127.0.0.1:50230/ has <html>, expected lang="en"

```

## Docs probe, green (proposed fences, N1–N3)

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| nuxt      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| nuxt      | connect-comvi | pass     | pass    | pass  | pass      | pass   |

```

The render step now also reads the server HTML for `lang="en"` and `dir="ltr"` on `<html>`.
`nuxt typecheck` passes without `import type {} from '@comvi/nuxt'`.

## examples:e2e, red (example without `useLocaleHead()`, no `comvi.head`)

```
nuxt (main): Playwright output
framework  build  a   b   c   d   e   f     g   g2    h   i   j   k     k2    k3    l   m   n     o   p   q   r     s
nuxt       ok     ok  ok  ok  ok  ok  FAIL  ok  skip  ok  ok  ok  skip  skip  skip  ok  ok  FAIL  ok  ok  ok  FAIL  ok
failures:
nuxt/f: Error: expect(received).toMatch(expected) | Expected pattern: /<html[^>]*\blang="uk"/ | Received string:  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"
nuxt/n: Error: expect(locator).toHaveAttribute(expected) failed | Locator:  locator('html') | Expected: "en" | Received: ""
nuxt/r: Error: expect(locator).toHaveAttribute(expected) failed | Locator:  locator('html') | Expected: "de" | Received: ""

```

## examples:e2e, green, default

```
framework  build  a   b   c   d   e   f   g   g2    h   i   j   k     k2    k3    l   m   n   o   p   q   r   s
nuxt       ok     ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  skip  skip  ok  ok  ok  ok  ok  ok  ok  ok
```

## examples:e2e, green, `--cdn`

```
framework  build  a   b   c   d   e   f   g   g2  h   i   j   k   k2  k3  l   m   n   o   p   q   r   s
nuxt       ok     ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  skip
```

## After the rebase on 710d5ea6 (DX-Next landed)

Platform docs `origin/develop` @ 3a2b77e3. The Next tab is as published. The Nuxt tabs are
replaced by the proposed fences above; the Nuxt tabs upstream had not changed since e3b4ed6d.
Next 16.3.8 (create-next-app scaffold). The probe now also checks Next's server HTML for
`lang="en"` at `/`. It also deletes the scaffold's `src/app/layout.tsx` and `src/app/page.tsx`, as
the quick start tells the reader to. Before that step the scaffold's own `<html lang="en">`
wrapped the docs layout, and a red stub passed.

```bash
pnpm docs:quickstart --content <scratch>/next-red --only next --no-build --no-pack  # red: layout writes <html>
pnpm docs:quickstart --content <scratch>/rebased --only next --no-build --no-pack   # green
pnpm docs:quickstart --content <scratch>/rebased --only nuxt --no-build --no-pack   # green
```

### Next, red (`<html lang={locale}>` stubbed to `<html>` in the docs copy)

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| next      | quick-start   | pass     | pass    | pass  | pass      | fail   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | fail   |

First failing line per step:
- next / quick-start / render: error: server HTML at http://localhost:61659/ has <html>, expected lang="en"
- next / connect-comvi / render: error: server HTML at http://localhost:61626/ has <html>, expected lang="en"

```

### Next, green

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| next      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | pass   |

```

### Nuxt, green

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| nuxt      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| nuxt      | connect-comvi | pass     | pass    | pass  | pass      | pass   |

```
