import type { ParsedToken } from "../../src/core/translate/cache";
import type { SyntaxExtension } from "../../src/core/translate/syntax";
import type { VirtualNode } from "../../src/virtualNode";

/** Token kind of the extensions below: outside the `TK_*` range the core owns. */
const TK_MARK = 90 as unknown as ParsedToken[0];

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
        ? { token: [TK_MARK, "mark"] as ParsedToken, endIndex: index + 6 }
        : undefined;
    },
    processHook(token) {
      return token[0] === TK_MARK ? "!" : undefined;
    },
  };
}

/** The literal every {@link makeMarkExtension} claims. */
export const MARK = "<mark>";

export interface MarkExtensionOptions {
  id: string;
  cacheBit: number;
  /** What `processHook` returns; `undefined` makes the extension DECLINE the token. */
  result: string | VirtualNode | Array<string | VirtualNode> | undefined;
  /**
   * What the parsed token carries. `"source"` makes the payload byte-equal to
   * the consumed template text, which is the case static detection must not
   * mistake for an unchanged template.
   */
  payload?: "id" | "source";
}

/** An extension claiming the literal `<mark>`, parameterised over what it renders. */
export function makeMarkExtension({
  id,
  cacheBit,
  result,
  payload = "id",
}: MarkExtensionOptions): SyntaxExtension {
  return {
    id,
    cacheBit,
    parseHook(template, index) {
      if (!template.startsWith(MARK, index)) return undefined;
      const value = payload === "source" ? template.slice(index, index + MARK.length) : id;
      return { token: [TK_MARK, value] as ParsedToken, endIndex: index + MARK.length };
    },
    processHook(token) {
      return token[0] === TK_MARK ? result : undefined;
    },
  };
}
