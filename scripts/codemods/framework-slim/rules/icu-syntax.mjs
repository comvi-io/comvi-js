/**
 * The ICU detector, mirrored from the runtime it has to agree with.
 *
 * `packages/core/src/core/translate/compile-simple.ts` throws `E_ICU_SYNTAX`
 * for a comma inside a balanced `{…}` argument, and
 * `core/translate/parser.ts` decides which braces are arguments at all: ICU
 * DOUBLE_OPTIONAL quoting means `'{`…`}'` is literal text, so `"it's {count}"`
 * has an argument and `"'{count, plural, …}'"` does not.
 *
 * Reimplemented here rather than imported: the codemod runs on user sources
 * from a checked-in script, with no build of the workspace in between. The two
 * copies are kept honest by the golden fixtures — a template this detector
 * calls ICU is one the runtime throws on.
 */

/** Index after the `}` that closes the brace opened at `open`, or -1. */
function matchingBraceEnd(template, open, length) {
  let depth = 1;
  let i = open + 1;
  while (i < length && depth > 0) {
    const char = template[i];
    if (char === "'") {
      i = advancePastApostrophe(template, i, length);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    i += 1;
  }
  return depth === 0 ? i : -1;
}

/**
 * An apostrophe opens a quoted literal ONLY in front of a syntax character
 * (`isQuoteStart` in the runtime parser, ICU DOUBLE_OPTIONAL). Anywhere else it
 * is content — which is why "Superiors' behavior" does not swallow the rest of
 * the template.
 */
function advancePastApostrophe(template, index, length) {
  if (template[index + 1] === "'") return index + 2;
  const next = template[index + 1];
  if (next !== "{" && next !== "}") return index + 1;
  let i = index + 2;
  while (i < length) {
    if (template[i] === "'") {
      if (template[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return i;
}

/**
 * The ICU argument type of the first `{…}` argument the SIMPLE compiler would
 * throw on, or `undefined` when the template is plain text + `{param}`.
 *
 * Unbalanced braces return `undefined`: the runtime warns and emits the rest as
 * text, so there is no argument to migrate.
 */
export function icuArgumentType(template) {
  const length = template.length;
  let i = 0;
  while (i < length) {
    const char = template[i];
    if (char === "'") {
      i = advancePastApostrophe(template, i, length);
      continue;
    }
    if (char !== "{") {
      i += 1;
      continue;
    }
    const end = matchingBraceEnd(template, i, length);
    if (end === -1) return undefined;
    const content = template.slice(i + 1, end - 1);
    const comma = content.indexOf(",");
    if (comma !== -1) {
      const [argumentType] = content.slice(comma + 1).split(",", 1);
      return argumentType.trim();
    }
    i = end;
  }
  return undefined;
}
