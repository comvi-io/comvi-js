import type { ParsedToken } from "../../src/core/translate/cache";
import type { SyntaxExtension } from "../../src/core/translate/syntax";

/** Token kind of the marker extension: outside the `TK_*` range the core owns. */
const TK_MARK = 9;

/**
 * A second syntax extension, so the two-extension paths are testable: which
 * extension a claimed character goes to at parse time, and what a processor
 * does with a token some OTHER extension produced at render time.
 *
 * It claims `&mark;` — a sequence the tag extension always declines, since the
 * tag grammar owns only `&lt;`, `&gt;` and `&amp;` — and renders it as `!`.
 */
export function makeMarkerExtension(): SyntaxExtension {
  return {
    id: "test:marker",
    cacheBit: 2,
    parseHook(template, index) {
      return template.startsWith("&mark;", index)
        ? { token: [TK_MARK, "mark"] as unknown as ParsedToken, endIndex: index + 6 }
        : undefined;
    },
    processHook(token) {
      return (token[0] as number) === TK_MARK ? "!" : undefined;
    },
  };
}
