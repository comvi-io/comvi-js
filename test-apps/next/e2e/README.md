# E2E Tests — test-apps/next

## Purpose

These Playwright tests cover **tearing scenarios** that a happy-dom Vitest
harness cannot observe. happy-dom commits trees atomically into the DOM —
`getByTestId` only reads a committed snapshot; you cannot observe a
mid-transition state where one sibling has been processed and the other
has not.

Running in a real Chromium browser exposes React's concurrent renderer
behaviour. The poller samples the live DOM at ~16 ms (one frame) intervals
and asserts **pair-consistency** at every sample: the two `<T>` consumers
of `home.title` must always show the same locale value (both EN or both FR
— never mixed).

The happy-dom companion suite at `packages/react/tests/tearing.test.tsx`
is the structural-soundness check; this Playwright suite is the
browser-observable complement.

## How to run

```bash
# From the test-apps/next directory:
cd test-apps/next

# 1. Install the Chromium binary (once per machine / CI runner):
pnpm test:e2e:install

# 2. Run the E2E tests (starts Next dev server automatically on port 3000):
pnpm test:e2e
```

The `webServer` config in `playwright.config.ts` spawns `pnpm dev` and waits
for `http://localhost:3000` before running tests. On a developer machine with
the server already running, Playwright reuses it (`reuseExistingServer: true`).
On CI, `reuseExistingServer` is `false` so a fresh server is always started.

## CI notes

- Chromium binary must be installed before `pnpm test:e2e`. In CI, add a step:
  ```yaml
  - run: pnpm --filter @test-apps/next test:e2e:install
  - run: pnpm --filter @test-apps/next test:e2e
  ```
- The Next dev server (`pnpm dev`) resolves workspace package paths via the
  `tsconfig.json` path aliases, so no build step is required.
- The E2E web server runs on port **3001** (`pnpm exec next dev -p 3001`). The
  existing `pnpm dev` script uses port 2000 (`next dev --turbopack -p 2000`) for
  local development, so the two do not collide.
- If the Chromium binary cannot be installed (restricted CI environment), add
  `test.describe.configure({ mode: "skip" })` at the top of `tearing.spec.ts`
  and document the exact install command needed for the CI runner.

## Test structure

| Test                   | Key assertion                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| TC1: initial state     | both consumers show EN ("Comvi i18n Example")                    |
| TC2: EN→FR flip        | pair-consistent throughout; settles to FR ("Exemple Comvi i18n") |
| TC3: FR→EN reset       | pair-consistent throughout; settles back to EN                   |
| TC4: rapid double flip | interleaved transitions remain pair-consistent; settles to EN    |

## Translation keys used

```
home.title
  EN: "Comvi i18n Example"
  FR: "Exemple Comvi i18n"
```

Source: `src/i18n/locales/{en,fr}.json`

## Tearing page

`src/app/[locale]/tearing/page.tsx` — client component with:

- Two independent `SlowConsumer` components reading `home.title` via `useI18n()`
- A button triggering `startTransition(() => setLocale("fr"))`
- An artificial `useEffect` delay to widen the observable mid-commit window

URL note: the middleware uses `localePrefix: "as-needed"`, so the default locale
`en` is stripped. The canonical test URL is `/tearing` (not `/en/tearing`).
Non-default locales use their prefix normally (e.g. `/fr/tearing`).
