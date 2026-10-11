import { TK_TEXT } from "../../src/core/translate/cache";
import type { MessageCompiler } from "../../src/core/translate/syntax";

/**
 * Deliberately odd compilers used to prove that template-cache entries are
 * keyed per compiler id.
 *
 * Neither declares a `cid`: an explicit id is returned verbatim by
 * `getCompilerId`, so two custom compilers declaring the same one would
 * legitimately SHARE cache entries. Omitting it exercises the WeakMap path the
 * cache contract actually relies on.
 */

/** Compiles every `{…}` argument to `«<first word>»`. */
export const markerCompiler: MessageCompiler = {
  makeArgToken(content) {
    return [TK_TEXT, `«${content.trim().split(",")[0]}»`];
  },
};

/** Like {@link markerCompiler}, but counts parses so a re-parse is observable. */
export function countingCompiler(): { compiler: MessageCompiler; parses: () => number } {
  let parses = 0;
  return {
    compiler: {
      makeArgToken(content) {
        parses++;
        return [TK_TEXT, `«${content.trim().split(",")[0]}»`];
      },
    },
    parses: () => parses,
  };
}
