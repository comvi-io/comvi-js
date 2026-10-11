/**
 * Ambient tag-syntax registration (module side effect).
 *
 * Imported bare by `@comvi/core/tags` and by the CDN entry (`src/umd.ts`), so
 * plain string-API `t()` calls parse `<tag>...</tag>` whenever either is in the
 * module graph. The ESM root does NOT import it; a development-only warning
 * fires when an unclaimed `<` reaches the parser instead. This file's dist
 * chunk MUST stay listed in the package `sideEffects` array and keep a
 * deterministic (hash-free) file name.
 */
import { registerTagSyntax } from "./core/translate/tags";

registerTagSyntax();
