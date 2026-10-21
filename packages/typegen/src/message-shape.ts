/**
 * What one translation message asks of its caller, read with the grammar
 * `@comvi/core` reads at runtime.
 *
 * `@comvi/vite-plugin` projects this to the parameters it generates types for;
 * anything else that has to agree with those types about a message — which
 * plural selectors it writes, which tags it uses — reads the same scan instead
 * of a second ICU reader. `tests/message-shape-runtime-parity.test.ts` pins the
 * parameter set against core itself.
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

export interface MessageShape {
  /** First-seen order; a name used twice keeps the type of its first use. */
  params: SchemaParam[];
  /** Argument → selectors as written (`"one"`, `"other"`, `"=0"`), plural and selectordinal alike. */
  plurals: Record<string, string[]>;
  /** The arguments that are `selectordinal` — plural rules of `Intl` type `"ordinal"`. */
  ordinals: string[];
  /** Argument → selectors as written. */
  selects: Record<string, string[]>;
  /** Names of opening and self-closing tags, sorted, each once. */
  tags: string[];
  /** Names of tags closed without an opening or opened without a close, sorted, each once. */
  unbalancedTags: string[];
  /** The first argument type core does not implement, when there is one. */
  unsupported?: string;
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
  ordinals: string[];
  selects: Record<string, string[]>;
  unsupported?: string;
}

/** Adds each choice's selector to `name`'s list in `record`, once, in the order first written. */
function addSelectors(record: Record<string, string[]>, name: string, choices: Choice[]): void {
  const list = (record[name] ??= []);
  for (const { selector } of choices) {
    if (!list.includes(selector)) list.push(selector);
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
      addSelectors(scan.plurals, argument.name, argument.choices);
      if (argument.ordinal && !scan.ordinals.includes(argument.name)) {
        scan.ordinals.push(argument.name);
      }
    } else {
      addSelectors(scan.selects, argument.name, argument.choices);
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

/**
 * The tags of one message, in a pass of its own over the raw text. A tag is
 * never a refusal, so nothing here touches `unsupported`.
 *
 * `<name>` opens, `<name/>` stands alone, `</name>` closes the nearest open
 * tag of that name. A close with no open, and an open whose close never comes
 * (or comes after a different tag was closed over it), is unbalanced.
 *
 * What core's parser reads as text is skipped here too: ICU-quoted text, the
 * `\<` escape, and everything after a `{` that nothing closes. Tags inside a
 * plural or select branch count. One simplification: `'#'` is read as text
 * everywhere, although inside a plural branch it opens a quote, so a tag
 * quoted that way is still collected.
 */
function scanTags(value: string): { tags: string[]; unbalancedTags: string[] } {
  const len = value.length;
  const tags = new Set<string>();
  const unbalanced = new Set<string>();
  const open: string[] = [];
  let i = 0;

  while (i < len) {
    const code = value.charCodeAt(i);

    if (code === APOSTROPHE) {
      i = advancePastApostrophe(value, i, false);
      continue;
    }

    if (code === BACKSLASH && value.charCodeAt(i + 1) === LESS_THAN) {
      i += 2;
      continue;
    }

    if (code === OPEN_BRACE && closingBrace(value, i, false) === undefined) break;

    if (code !== LESS_THAN) {
      i++;
      continue;
    }

    const closing = value.charCodeAt(i + 1) === SLASH;
    let j = closing ? i + 2 : i + 1;
    if (!isTagNameStartChar(value.charCodeAt(j))) {
      i++;
      continue;
    }

    // Past the end `charCodeAt` is NaN, which no comparison here accepts, so
    // these scans need no bounds check.
    const nameStart = j;
    while (isTagNameChar(value.charCodeAt(j))) j++;
    const name = value.slice(nameStart, j);
    while (value.charCodeAt(j) <= SPACE) j++;

    const selfClosing =
      !closing && value.charCodeAt(j) === SLASH && value.charCodeAt(j + 1) === GREATER_THAN;
    if (!selfClosing && value.charCodeAt(j) !== GREATER_THAN) {
      i++;
      continue;
    }

    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) unbalanced.add(name);
      else for (const left of open.splice(at)) if (left !== name) unbalanced.add(left);
    } else {
      tags.add(name);
      if (!selfClosing) open.push(name);
    }
    i = selfClosing ? j + 2 : j + 1;
  }

  for (const name of open) unbalanced.add(name);
  return { tags: [...tags].sort(), unbalancedTags: [...unbalanced].sort() };
}

/** The shape of one translation message. */
export function scanMessageShape(value: string): MessageShape {
  // Null prototype: an argument literally named `__proto__` is data, not
  // Object.prototype's setter.
  const scan: MessageScan = {
    params: new Map(),
    plurals: Object.create(null) as Record<string, string[]>,
    ordinals: [],
    selects: Object.create(null) as Record<string, string[]>,
  };
  // A whole message starts outside any plural, so `#` is literal text here.
  scanMessage(value, scan, false);

  const shape: MessageShape = {
    params: Array.from(scan.params.values()),
    plurals: scan.plurals,
    ordinals: scan.ordinals,
    selects: scan.selects,
    ...scanTags(value),
  };
  if (scan.unsupported !== undefined) shape.unsupported = scan.unsupported;
  return shape;
}
