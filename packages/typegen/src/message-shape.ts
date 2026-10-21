/**
 * What one translation message asks of its caller, read with the grammar
 * `@comvi/core` reads at runtime.
 *
 * `@comvi/vite-plugin` projects `scanMessageArguments` to the parameters it
 * generates types for; anything else that has to agree with those types about
 * a message — which plural selectors it writes, which tags it uses — reads the
 * same scan instead of a second ICU reader. Two parity tests pin it against
 * core itself: `tests/message-shape-runtime-parity.test.ts` the parameter set,
 * `tests/message-shape-tag-parity.test.ts` the tags.
 *
 * - `{name}`, `{ name }`, `{name x}`, `{0}` → one `string` parameter whose name
 *   is the trimmed contents, because that is what core's compiler makes of a
 *   group with no comma in it.
 * - `{count, plural, …}` and `{count, selectordinal, …}` → `number`.
 * - `{gender, select, …}` → `string`.
 * - Any other argument type — `{price, number}`, `{when, date, short}`,
 *   `{n, pluralx, …}` — and any of the three with a choice list that does not
 *   parse: NO parameter from that group, and `unsupported` names the first such
 *   type. `@comvi/core` implements no `number`, `date` or `time` argument type
 *   (see `docs/design/limitations.md`); it raises `E_ICU_SYNTAX`, which the
 *   ingestion preflight turns into a refusal of the whole key.
 * - An unclosed `{` makes everything from it to the end literal text, as core's
 *   `extractToken` does when `findMatchingBraceEnd` finds no match.
 */

import type { SchemaParam } from "./index";

/**
 * The ICU arguments of one message. The three records are null-prototype, so
 * an argument named `__proto__` or `constructor` is an ordinary key; read them
 * with `Object.keys`/`in`, never through inherited members.
 *
 * Selectors are listed once each, in the order first written. A plural's and
 * an ordinal's explicit values are spelled as core matches them — `=01` and
 * `=1.0` are `"=1"` — and a select's are kept as written.
 */
export interface MessageArguments {
  /** First-seen order; a name used twice keeps the type of its first use. */
  params: SchemaParam[];
  /** `plural` argument → its selectors (`"one"`, `"other"`, `"=0"`): `Intl.PluralRules` type `"cardinal"`. */
  plurals: Record<string, string[]>;
  /** `selectordinal` argument → its selectors: `Intl.PluralRules` type `"ordinal"`. */
  ordinals: Record<string, string[]>;
  /** `select` argument → its selectors. */
  selects: Record<string, string[]>;
  /** The first argument type core does not implement, when there is one. */
  unsupported?: string;
}

/**
 * A message's arguments and its tags, read as core reads them with
 * `@comvi/core/tags` registered.
 */
export interface MessageShape extends MessageArguments {
  /** Tags core renders as tags — it calls their handlers — in any branch; sorted, each once. */
  tags: string[];
  /**
   * Names written as tag markup that core renders as literal text: an opening
   * `<name>` whose close never comes (or comes after a close for another tag,
   * since core requires strict nesting), a `</name>` that closes nothing, and
   * any tag written after a `{` that nothing closes, which core renders as text
   * with the rest of the message. Sorted, each once. A name can be in both lists when one use of it works
   * and another does not.
   */
  unbalancedTags: string[];
}

/**
 * ICU DOUBLE_OPTIONAL quoting, the rule `@comvi/core`'s message parser applies
 * at runtime (`packages/core/src/core/translate/parser.ts`, `parseTemplate` and
 * `advancePastApostrophe`): an apostrophe opens quoted literal text only when it
 * immediately precedes a syntax character, and `''` is always one literal
 * apostrophe. So "Superiors' behavior" and a trailing "l'" survive as text,
 * while `'{name}'` is the literal five characters `{name}` and carries no
 * parameter.
 *
 * `{` and `}` are syntax everywhere; `#` is syntax only inside a plural or
 * selectordinal sub-message, so `'#'` at the top level is two literal
 * apostrophes around a hash.
 *
 * The scan has to read the same grammar the compiler does, or the generated
 * types demand an argument no message consumes — a call the app cannot make
 * without inventing a value. Core does not publish its parser (only the
 * `MessageCompiler` type), and neither consumer of this package depends on
 * `@comvi/core` at runtime, so the rule is reimplemented here rather than
 * imported. The table in `tests/message-shape.test.ts` pins it case by case.
 *
 * @returns the index just after the apostrophe at `index` and whatever it quotes
 */
function advancePastApostrophe(value: string, index: number, hashIsSyntax: boolean): number {
  const len = value.length;

  // `''` — one literal apostrophe, opening nothing.
  if (value[index + 1] === "'") return index + 2;

  const next = value[index + 1];
  const opensQuote = next === "{" || next === "}" || (hashIsSyntax && next === "#");
  if (!opensQuote) return index + 1;

  // Quoted section: it ends at the next lone apostrophe, and `''` inside it is
  // a literal apostrophe rather than that end. An unterminated section runs to
  // the end of the message, which is what the runtime does with it too.
  let i = index + 1;
  while (i < len) {
    if (value[i] === "'") {
      if (value[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return i;
}

/**
 * Whether the `{` at `braceIndex` opens an argument that rebinds `#` — an ICU
 * plural or selectordinal. Mirrors `isPluralArgStart` in core's ICU compiler,
 * which the parser consults for exactly this.
 */
function opensHashScope(value: string, braceIndex: number): boolean {
  const len = value.length;
  let i = braceIndex + 1;

  while (i < len && value[i] !== ",") {
    if (value[i] === "{" || value[i] === "}") return false;
    i++;
  }
  if (i >= len) return false;
  i++;

  while (i < len && value.charCodeAt(i) <= 32) i++;
  const typeStart = i;
  while (i < len) {
    const char = value[i];
    if (char === "," || char === "{" || char === "}" || value.charCodeAt(i) <= 32) break;
    i++;
  }

  const type = value.slice(typeStart, i);
  return type === "plural" || type === "selectordinal";
}

/**
 * Index of the `}` closing the `{` at `open`, or `undefined` when nothing closes
 * it.
 *
 * Quoted sections are skipped, so a `'}'` inside a branch does not close it,
 * and `#`'s syntax status is tracked per nesting level the way core's
 * `findMatchingBraceEnd` tracks it: entering a plural argument turns `'#'` into
 * a quote opener, and leaving it restores whatever the enclosing level had.
 */
function closingBrace(value: string, open: number, hashIsSyntax: boolean): number | undefined {
  const len = value.length;
  let depth = 1;
  let i = open + 1;
  let context = hashIsSyntax || opensHashScope(value, open);
  const contextStack: boolean[] = [];

  while (i < len) {
    const char = value[i];

    if (char === "'") {
      i = advancePastApostrophe(value, i, context);
      continue;
    }

    if (char === "{") {
      depth++;
      contextStack.push(context);
      if (!context && opensHashScope(value, i)) context = true;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i;
      if (contextStack.length > 0) context = contextStack.pop()!;
    }
    i++;
  }

  return undefined;
}

/** One branch of a choice list: its selector as written, and its sub-message. */
interface Choice {
  selector: string;
  body: string;
}

/**
 * One `{…}` group, read the way core's `makeIcuArgToken` reads it.
 *
 * A comma at depth zero makes the argument TYPED, and only `plural`,
 * `selectordinal` and `select` are implemented — each needing a choice list
 * that parses. Everything else is a refusal, not a parameter.
 */
type Argument =
  | { kind: "param"; name: string }
  | { kind: "plural"; name: string; ordinal: boolean; choices: Choice[] }
  | { kind: "select"; name: string; choices: Choice[] }
  | { kind: "unsupported"; type: string };

/**
 * The choice list's branches, or `undefined` when the list is malformed.
 *
 * Mirrors core's `parsePluralChoices`: a selector runs to the next whitespace
 * or `{`, and what follows must be a braced sub-message. A trailing selector
 * with no sub-message, or anything that is not a selector followed by a brace,
 * makes the whole argument fail — which is why a malformed list produces no
 * parameter here either.
 */
function parseChoices(choicesStr: string, hashIsSyntax: boolean): Choice[] | undefined {
  const choices: Choice[] = [];
  const len = choicesStr.length;
  let i = 0;

  while (i < len) {
    while (i < len && choicesStr.charCodeAt(i) <= 32) i++;
    if (i >= len) break;

    const selectorStart = i;
    while (i < len) {
      const code = choicesStr.charCodeAt(i);
      if (code <= 32 || choicesStr[i] === "{") break;
      i++;
    }
    const selector = choicesStr.slice(selectorStart, i);

    while (i < len && choicesStr.charCodeAt(i) <= 32) i++;
    if (choicesStr[i] !== "{") return undefined;

    const close = closingBrace(choicesStr, i, hashIsSyntax);
    if (close === undefined) return undefined;

    choices.push({ selector, body: choicesStr.slice(i + 1, close) });
    i = close + 1;
  }

  return choices;
}

/** Reads the contents of one `{…}` group. `hashIsSyntax` applies to its quoting. */
function readArgument(content: string, hashIsSyntax: boolean): Argument {
  const len = content.length;
  let firstComma = -1;
  let secondComma = -1;
  let depth = 0;

  for (let i = 0; i < len; i++) {
    const char = content[i];

    if (char === "'") {
      i = advancePastApostrophe(content, i, hashIsSyntax) - 1;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === "," && depth === 0) {
      if (firstComma === -1) firstComma = i;
      else {
        secondComma = i;
        break;
      }
    }
  }

  // No comma: the whole content is the parameter name, whatever it looks like.
  // `{ spaced }`, `{name x}` and `{0}` are all parameters at runtime.
  if (firstComma === -1) return { kind: "param", name: content.trim() };

  const name = content.slice(0, firstComma).trim();
  const type = (
    secondComma === -1 ? content.slice(firstComma + 1) : content.slice(firstComma + 1, secondComma)
  ).trim();

  // A one-comma argument (`{n, plural}`) has a type but no choice list, which
  // core refuses as well.
  if (secondComma === -1) return { kind: "unsupported", type };

  const isPlural = type === "plural" || type === "selectordinal";
  if (isPlural || type === "select") {
    const choices = parseChoices(
      content.slice(secondComma + 1).trim(),
      isPlural ? true : hashIsSyntax,
    );
    if (choices === undefined) return { kind: "unsupported", type };
    return isPlural
      ? { kind: "plural", name, ordinal: type === "selectordinal", choices }
      : { kind: "select", name, choices };
  }

  return { kind: "unsupported", type };
}

/** What the ICU pass has collected so far. */
interface MessageScan {
  params: Map<string, SchemaParam>;
  plurals: Record<string, string[]>;
  ordinals: Record<string, string[]>;
  selects: Record<string, string[]>;
  unsupported?: string;
}

/** The number grammar core's ICU compiler accepts after `=` (`EXACT_VALUE`). */
const EXACT_VALUE = /^-?\d+(\.\d+)?$/;

/**
 * A selector as core matches it. With `exact` (a plural or ordinal), `=N` is
 * spelled `"=" + Number(N)`; one that is no number stays as written.
 */
function spellSelector(selector: string, exact: boolean): string {
  const value = selector.slice(1);
  return exact && selector[0] === "=" && EXACT_VALUE.test(value) ? `=${Number(value)}` : selector;
}

/** Adds each choice's selector to `name`'s list in `record`, once, in the order first written. */
function addSelectors(
  record: Record<string, string[]>,
  name: string,
  choices: Choice[],
  exact: boolean,
): void {
  const list = (record[name] ??= []);
  for (const { selector } of choices) {
    const spelled = spellSelector(selector, exact);
    if (!list.includes(spelled)) list.push(spelled);
  }
}

/**
 * Collect the arguments of one message.
 *
 * A `{…}` group is a placeholder or a typed argument; a typed argument's branch
 * bodies are messages of their own, so `{count, plural, one {item} other
 * {items}}` has ONE parameter and `{count, plural, other {# of {total}}}` has
 * two — a body's braces hold text, the braces inside a body hold a placeholder.
 *
 * `hashIsSyntax` is true inside a plural or selectordinal sub-message, where
 * `#` is syntax and therefore `'#'` opens a quoted literal.
 */
function scanMessage(value: string, scan: MessageScan, hashIsSyntax: boolean): void {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      // Quoted literal text holds no placeholders. The loop's own `i++` lands
      // on the first character past the quote.
      i = advancePastApostrophe(value, i, hashIsSyntax) - 1;
      continue;
    }

    if (value[i] !== "{") continue;

    const close = closingBrace(value, i, hashIsSyntax);
    // Nothing closes it: the rest of the message is literal text, exactly as
    // core's parser treats it, so no later group is a placeholder either.
    if (close === undefined) return;

    const argument = readArgument(value.slice(i + 1, close), hashIsSyntax);
    i = close;

    if (argument.kind === "unsupported") {
      scan.unsupported ??= argument.type;
      continue;
    }

    if (!scan.params.has(argument.name)) {
      scan.params.set(argument.name, {
        name: argument.name,
        type: argument.kind === "plural" ? "number" : "string",
      });
    }

    if (argument.kind === "param") continue;

    if (argument.kind === "plural") {
      addSelectors(
        argument.ordinal ? scan.ordinals : scan.plurals,
        argument.name,
        argument.choices,
        true,
      );
    } else {
      addSelectors(scan.selects, argument.name, argument.choices, false);
    }

    for (const { body } of argument.choices) {
      scanMessage(body, scan, hashIsSyntax || argument.kind === "plural");
    }
  }
}

const LESS_THAN = 60;
const GREATER_THAN = 62;
const SLASH = 47;
const SPACE = 32;
const BACKSLASH = 92;
const APOSTROPHE = 39;
const OPEN_BRACE = 123;

/** Core's tag-name rules (`packages/core/src/core/translate/tags.ts`). */
function isTagNameStartChar(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameChar(code: number): boolean {
  return isTagNameStartChar(code) || (code >= 48 && code <= 57) || code === 45 || code === 95;
}

/** `<name>`, `</name>` or `<name/>`, as the tag grammar would read it outside any quote. */
const TAG_MARKUP = /<\/?([A-Za-z][\w-]*)[\0- ]*\/?>/g;

/** What the tag pass has collected so far. */
interface TagScan {
  tags: Set<string>;
  unbalanced: Set<string>;
}

/*
 * The tag pass ports core's tag grammar rule for rule: `parseTemplate` in
 * `translate/parser.ts` for the text between tags, `parseTag` and
 * `findClosingTag` in `translate/tags.ts` for the tags. Past the end
 * `charCodeAt` is NaN, which no comparison here accepts, so the name and
 * whitespace scans need no bounds check.
 */

/**
 * `advancePastBalancedApostrophe`: inside an open tag an apostrophe quotes only
 * when its quote closes, so elision before a placeholder (`l'{name}`) does not
 * hide the tag's close.
 */
function advancePastBalancedApostrophe(
  value: string,
  index: number,
  hashIsSyntax: boolean,
): number {
  if (value[index + 1] === "'") return index + 2;
  const next = value[index + 1];
  if (next === "{" || next === "}" || (hashIsSyntax && next === "#")) {
    for (let i = index + 1; i < value.length; i++) {
      if (value[i] === "'") {
        if (value[i + 1] !== "'") return i + 1;
        i++;
      }
    }
  }
  return index + 1;
}

/**
 * `findClosingTag`: the `[start, end]` of the `</name>` that closes the tag
 * whose content starts at `start`, or `undefined`. Braces mean nothing here, a
 * backslash skips the character after it, and a close for any tag but the
 * innermost open one aborts the search — core requires strict nesting.
 */
function findClosingTag(
  value: string,
  start: number,
  name: string,
  hashIsSyntax: boolean,
): [number, number] | undefined {
  const len = value.length;
  const open = [name];
  let i = start;

  while (i < len) {
    const code = value.charCodeAt(i);

    if (code === APOSTROPHE) {
      i = advancePastBalancedApostrophe(value, i, hashIsSyntax);
      continue;
    }

    if (code === BACKSLASH) {
      i += 2;
      continue;
    }

    if (code === LESS_THAN) {
      const tagStart = i;
      const closing = value.charCodeAt(i + 1) === SLASH;
      if (closing || isTagNameStartChar(value.charCodeAt(i + 1))) {
        i += closing ? 2 : 1;
        const nameStart = i;
        while (isTagNameChar(value.charCodeAt(i))) i++;
        const tagName = value.slice(nameStart, i);
        while (value.charCodeAt(i) <= SPACE) i++;

        if (closing) {
          if (value.charCodeAt(i) === GREATER_THAN) {
            i++;
            if (tagName !== open[open.length - 1]) return undefined;
            open.pop();
            if (open.length === 0) return [tagStart, i];
          }
          continue;
        }

        if (value.charCodeAt(i) === SLASH && value.charCodeAt(i + 1) === GREATER_THAN) {
          i += 2;
          continue;
        }
        if (value.charCodeAt(i) === GREATER_THAN) {
          i++;
          open.push(tagName);
          continue;
        }
        i = tagStart + 1;
        continue;
      }
    }

    i++;
  }

  return undefined;
}

/**
 * `parseTag` at the `<` at `start`: records what it finds and returns where the
 * text scan resumes. A tag that does not parse is one literal `<`, so the scan
 * resumes right after it and still finds the tags inside.
 */
function readTag(value: string, start: number, hashIsSyntax: boolean, scan: TagScan): number {
  let i = start + 1;
  const closing = value.charCodeAt(i) === SLASH;
  if (closing) i++;
  if (!isTagNameStartChar(value.charCodeAt(i))) return start + 1;

  const nameStart = i;
  while (isTagNameChar(value.charCodeAt(i))) i++;
  const name = value.slice(nameStart, i);
  while (value.charCodeAt(i) <= SPACE) i++;
  const code = value.charCodeAt(i);

  // A close the text scan meets closes nothing: a working tag's close is
  // consumed with its tag. Core renders it as text.
  if (closing) {
    if (code === GREATER_THAN) scan.unbalanced.add(name);
    return start + 1;
  }

  if (code === SLASH) {
    if (value.charCodeAt(i + 1) !== GREATER_THAN) return start + 1;
    scan.tags.add(name);
    return i + 2;
  }

  if (code !== GREATER_THAN) return start + 1;

  const close = findClosingTag(value, i + 1, name, hashIsSyntax);
  if (close === undefined) {
    scan.unbalanced.add(name);
    return start + 1;
  }
  scan.tags.add(name);
  scanTags(value.slice(i + 1, close[0]), hashIsSyntax, scan);
  return close[1];
}

/**
 * `parseTemplate` with the tag extension: quoted text, the `\<` escape and
 * placeholder groups hold no tags; a plural or select branch is a message of
 * its own; an unclosed `{` ends this level, as core's `extractToken` breaks
 * out of it.
 */
function scanTags(value: string, hashIsSyntax: boolean, scan: TagScan): void {
  const len = value.length;
  let i = 0;

  while (i < len) {
    const code = value.charCodeAt(i);

    if (code === APOSTROPHE) {
      i = advancePastApostrophe(value, i, hashIsSyntax);
      continue;
    }

    if (code === BACKSLASH && value.charCodeAt(i + 1) === LESS_THAN) {
      i += 2;
      continue;
    }

    if (code === LESS_THAN) {
      i = readTag(value, i, hashIsSyntax, scan);
      continue;
    }

    if (code === OPEN_BRACE) {
      const close = closingBrace(value, i, hashIsSyntax);
      if (close === undefined) {
        // The rest of this level is literal text, tags and quotes alike.
        for (const markup of value.slice(i).matchAll(TAG_MARKUP)) scan.unbalanced.add(markup[1]);
        return;
      }
      const argument = readArgument(
        value.slice(i + 1, close),
        hashIsSyntax || opensHashScope(value, i),
      );
      if (argument.kind === "plural" || argument.kind === "select") {
        // Core keeps the LAST branch of a selector written twice; the earlier
        // one never renders, so its tags are not the message's.
        const bodies = new Map<string, string>();
        for (const { selector, body } of argument.choices) {
          bodies.set(spellSelector(selector, argument.kind === "plural"), body);
        }
        for (const body of bodies.values()) {
          scanTags(body, hashIsSyntax || argument.kind === "plural", scan);
        }
      }
      i = close + 1;
      continue;
    }

    i++;
  }
}

/** The ICU arguments of one translation message, without its tags. */
export function scanMessageArguments(value: string): MessageArguments {
  // Null prototype: an argument literally named `__proto__` is data, not
  // Object.prototype's setter.
  const scan: MessageScan = {
    params: new Map(),
    plurals: Object.create(null) as Record<string, string[]>,
    ordinals: Object.create(null) as Record<string, string[]>,
    selects: Object.create(null) as Record<string, string[]>,
  };
  // A whole message starts outside any plural, so `#` is literal text here.
  scanMessage(value, scan, false);

  const result: MessageArguments = {
    params: Array.from(scan.params.values()),
    plurals: scan.plurals,
    ordinals: scan.ordinals,
    selects: scan.selects,
  };
  if (scan.unsupported !== undefined) result.unsupported = scan.unsupported;
  return result;
}

/** The shape of one translation message: its ICU arguments and its tags. */
export function scanMessageShape(value: string): MessageShape {
  const scan: TagScan = { tags: new Set(), unbalanced: new Set() };
  scanTags(value, false, scan);
  return {
    ...scanMessageArguments(value),
    tags: [...scan.tags].sort(),
    unbalancedTags: [...scan.unbalanced].sort(),
  };
}
