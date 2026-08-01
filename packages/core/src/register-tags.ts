/**
 * Ambient tag-syntax registration (module side effect).
 *
 * Imported bare by BOTH the root entry and `@comvi/core/tags`, so plain
 * string-API `t()` calls parse `<tag>...</tag>` whenever either entry is in
 * the module graph. This file's dist chunk MUST stay listed in the package
 * `sideEffects` array and keep a deterministic (hash-free) file name.
 */
import { registerTagSyntax } from "./core/translate/tags";

registerTagSyntax();
