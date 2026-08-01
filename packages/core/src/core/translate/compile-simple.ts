import { warn } from "../../logger";
import { TK_PARAM, type ParsedToken } from "./cache";
import type { MessageCompiler } from "./syntax";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** Dev-only: templates already warned about (once per template). */
const warnedIcuTemplates = IS_DEV ? new Set<string>() : undefined;

/**
 * The slim message compiler: text + `{param}` interpolation only.
 *
 * A comma inside braces is the ICU argument-type marker (`{name, plural, …}`);
 * the whole braced segment then flows through as literal text, with a
 * once-per-template dev warning pointing at the ICU compiler.
 */
export const simpleCompiler: MessageCompiler = {
  cid: 1,
  makeArgToken(content: string, _hashIsSyntax: boolean, template: string): ParsedToken | undefined {
    if (content.indexOf(",") !== -1) {
      if (IS_DEV && warnedIcuTemplates !== undefined && !warnedIcuTemplates.has(template)) {
        warnedIcuTemplates.add(template);
        warn(
          `[i18n] ICU syntax detected in "${template}"; the slim entry only supports {param}. Pass the ICU compiler from @comvi/core/icu or import @comvi/core.`,
        );
      }
      return undefined;
    }
    return [TK_PARAM, content.trim()];
  },
};
