/**
 * `comvi.types`: the typed-translations declaration from local JSON catalogs.
 *
 * A thin wrapper over the typegen Node API (the workspace-private typegen package, inlined
 * at build time), so the bytes are the ones `comvi typegen --from`, `@comvi/vite-plugin`
 * and `withComvi({ types })` write for the same catalogs. It runs in `prepare:types`, the
 * hook every Nuxt command that writes the tsconfigs calls (`nuxt prepare`, `typecheck`,
 * `build`, `dev`) after it has cleared the build directory:
 *
 * - `nuxt dev`: one typegen watcher regenerates on every catalog change until Nuxt closes;
 *   an error is reported and the server goes on;
 * - any other command: generates once; an error fails the command.
 *
 * The file is added to the app's references and to Nitro's (`nitro:prepare:types`), so
 * `.vue` files and server routes see the same keys without a tsconfig entry.
 */
import path from "node:path";
import type { Nuxt } from "@nuxt/schema";
import { generate, watch, type GenerateMessage, type Watcher } from "@comvi/typegen";
import type { NuxtI18nTypes } from "./types";

const PREFIX = "[@comvi/nuxt]";

function print({ level, text }: GenerateMessage): void {
  (level === "info" ? console.info : level === "warn" ? console.warn : console.error)(
    `${PREFIX} ${text}`,
  );
}

export function setupTypes(nuxt: Nuxt, types: NuxtI18nTypes, defaultLocale: string): void {
  // The versions the declaration is verified on: older ones keep it where their tsconfigs do
  // not look (4.0–4.5, a second build) or give Nitro no reference (3.x before 3.16).
  const version = (nuxt as { _version?: string })._version;
  const [major, minor = 0, patch = 0] = String(version).split(".").map(Number);
  if ((major === 3 && minor * 1000 + patch < 21011) || (major === 4 && minor < 6))
    throw new Error(
      `${PREFIX} \`comvi.types\` needs Nuxt 3.21.11+ or 4.6.0+, and this app has Nuxt ${version}. ` +
        "Upgrade Nuxt or remove `comvi.types`: translations work on this version without it.",
    );
  if (typeof types?.from !== "string" || types.from === "")
    throw new TypeError(
      `${PREFIX} \`comvi.types.from\` must name the catalogs directory, e.g. "./i18n/locales"`,
    );

  const root = nuxt.options.rootDir;
  // Where Nuxt writes the tsconfigs: `typesDir` (Nuxt 4; a second production build moves
  // `buildDir` to `node_modules/.cache/nuxt/.nuxt` and keeps them in `.nuxt`), else `buildDir`.
  const typesDir = nuxt.options.typesDir || nuxt.options.buildDir;
  const out = path.resolve(root, types.out ?? path.join(typesDir, "types/comvi.d.ts"));
  const settings = {
    from: types.from,
    out,
    root,
    sourceLocale: types.sourceLocale ?? defaultLocale,
    fileTemplate: types.fileTemplate,
    augment: types.augment,
    onMessage: print,
  };
  let run: Promise<void> | undefined;
  let watcher: Watcher | undefined;

  nuxt.hook("prepare:types", ({ references }) => {
    references.push({ path: out });
    if (nuxt.options.dev) {
      // One watcher per Nuxt instance; a restarted dev server closes this one first.
      try {
        watcher ??= watch(settings);
      } catch (error) {
        // A settings error (`augment`, `fileTemplate`, no declared Comvi package): dev
        // reports it and goes on, and Nuxt still writes its own tsconfigs.
        print({ level: "error", text: (error as Error).message });
        return;
      }
      return watcher.ready;
    }
    return (run ??= generate(settings).then(
      () => {},
      (error: unknown) => {
        // A build must not ship against types that no longer match the catalogs.
        throw Object.assign(
          new Error(
            `${PREFIX} Cannot generate ${path.relative(root, out)}: ${(error as Error).message}`,
          ),
          { cause: error },
        );
      },
    ));
  });
  nuxt.hook("nitro:prepare:types", ({ references }) => {
    references.push({ path: out });
  });
  nuxt.hook("close", () => {
    watcher?.close();
    watcher = undefined;
  });
}
