import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * `@comvi/next/server` carries its own `server-only` guard, so apps do not
 * install the marker or import it themselves. The unit tests alias the marker
 * to its empty module (vitest is not a react-server graph), so the claim
 * "the guard ships" can only be checked on the BUILT entries: rolldown must
 * keep the bare import, external, in both artifact families.
 *
 * What the guard DOES is Next's business, so it was checked by hand on the
 * packed tarball in the `examples/next` app (`pnpm examples:verify --only next
 * --keep`, then `next build` in the kept dir): a `"use client"` module that
 * imports `@comvi/next/server`, directly or through `src/i18n/server.ts`, fails
 * with "'server-only' cannot be imported from a Client Component module", and
 * the unmodified example, which imports it only from Server Components, builds.
 * Turbopack (`next build --turbopack`, Next 16's default) is why the two
 * server files are listed in `sideEffects`: under a blanket `false` it prunes
 * the bare import from the re-export barrel and the client build succeeds.
 *
 * `middleware.js` deliberately has no guard: it runs in Next's middleware
 * layer, never in a client graph, and the marker would make the plain-node
 * unit tests apps write for their middleware throw.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const entries = ["server.js", "server.dev.js"].map((file) => path.join(packageRoot, "dist", file));

beforeAll(() => {
  for (const file of entries) {
    if (!fs.existsSync(file)) {
      throw new Error(`dist is missing — build @comvi/next before this test (${file})`);
    }
  }
});

describe.each(entries)("%s", (entry) => {
  it("keeps `server-only` as a bare, external side-effect import", () => {
    expect(fs.readFileSync(entry, "utf8")).toMatch(/^import "server-only";$/m);
  });
});

describe("package.json", () => {
  it("lists both server entries in `sideEffects`, so no bundler prunes the guard", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    expect(manifest.sideEffects).toEqual(["./dist/server.js", "./dist/server.dev.js"]);
  });
});

describe("the other entries", () => {
  it.each(["index.js", "client.js", "middleware.js", "proxy.js", "routing.js", "navigation.js"])(
    "%s does not import the guard",
    (file) => {
      const code = fs.readFileSync(path.join(packageRoot, "dist", file), "utf8");
      expect(code).not.toMatch(/^import "server-only";$/m);
    },
  );
});
