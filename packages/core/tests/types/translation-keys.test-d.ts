/**
 * The shared `TranslationKeys` augmentation. Module augmentation is
 * PROGRAM-global under `tsconfig.test-types.json`, so this file owns it for
 * every `.test-d.ts` in the program: `default-params.test-d.ts` types the
 * default-params surface against it, and `subpaths.test-d.ts` relies on
 * `count` / `review` being declared here.
 */
declare module "@comvi/core" {
  interface TranslationKeys {
    review: { formality: "formal" | "informal" };
    greeting: { formality: "formal" | "informal"; name: string };
    count: { count: number };
    "admin:title": never;
  }
}

export {};
