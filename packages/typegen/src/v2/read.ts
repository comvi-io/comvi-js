/**
 * What one translation message asks of its caller, read by `@comvi/core`'s OWN scanner
 * (`packages/core/src/compile/scanner.ts`, `icu.ts`) through its development-only shape
 * observer (`Scan.o`). There is no ICU reader in this package: the grammar the types
 * are generated from is, by construction, the grammar that renders the message.
 * `tests/v2-read-runtime-parity.test.ts` measures the runtime's consumption against it.
 *
 * What is recorded mirrors the platform's v2 extractor (`platform/apps/api/src/modules/
 * translations/utils/icu-schema-v2.ts`), so a local directory and the platform route
 * produce the same wire schema:
 *
 * - `{name}` is a `string` param; `{name, plural|selectordinal|select, …}` its kind; a
 *   name used twice keeps its first kind, except that a choice kind replaces `string`;
 * - a select's options are its selectors other than `other`, in message order, merged
 *   across uses; `other` is true only when every use has it;
 * - `<tag>` and `<tag/>` are tags, first-seen order;
 * - a repeated selector's sub-message never renders (core keeps the first): its params,
 *   tags and options are not recorded;
 * - a syntax error stops the scan; what was read before it is kept and `error` says why.
 *   `{x, number|date|time}` records its kind and then fails, like core (R3-8). Here the
 *   platform is more lenient — it reads on past such an argument — so a message core
 *   refuses can differ from the platform's schema after the failure point; both report
 *   it (the platform as a warning, `local.ts` as an issue).
 */
import { message, SYNTAX, type Scan } from "../../../core/src/compile/scanner";
import type { ParamKind } from "./wire";

export interface ReadParam {
  name: string;
  kind: ParamKind;
  options?: string[];
  other?: boolean;
}

/** One plural, selectordinal or select argument as written (one entry per occurrence). */
export interface ReadChoice {
  name: string;
  kind: "plural" | "selectordinal" | "select";
  /** Its selectors, each once, in message order; exact values as core matches them (`=01` → `=1`). */
  selectors: string[];
}

export interface ReadMessage {
  params: ReadParam[];
  tags: string[];
  /**
   * Every choice argument that renders, in scan order (an argument before the ones in its
   * branches). Unlike `params`, a name used twice is listed twice: each is judged alone.
   */
  choices: ReadChoice[];
  /** Core cannot compile the message: it renders the key and reports `syntax`. */
  error?: string;
  /**
   * The argument type that made core refuse the message: `number`, `date`, `time`, an
   * unknown type (`pluralx`), or the choice kind whose selector is not in core's grammar
   * (`{n, plural, =x {…}}` → `plural`). Unset for any other syntax error.
   */
  unsupported?: string;
  /** Things the schema settled that a translator should look at. */
  diagnostics: string[];
}

interface Choice {
  name: string;
  kind: "plural" | "selectordinal" | "select";
  selectors: string[];
  /** Its entry in `choices`, unless it never renders. */
  entry?: ReadChoice;
  /** The choice itself sits in a sub-message that never renders. */
  muted: boolean;
  /** The selector being scanned is a repeat (or the choice is muted). */
  current: boolean;
  /** Recorded as a param: at its first selector or its end, after the choice list's `,`. */
  added: boolean;
}

const KINDS: Record<string, ParamKind | undefined> = Object.assign(Object.create(null), {
  plural: "plural",
  selectordinal: "selectordinal",
  select: "select",
  number: "number",
  date: "date",
  time: "time",
});

export function readMessage(text: string): ReadMessage {
  const params = new Map<string, ReadParam>();
  const tags: string[] = [];
  const diagnostics: string[] = [];
  const stack: Choice[] = [];
  const choices: ReadChoice[] = [];
  /** The last argument type seen, while the scan is still inside its header. */
  let refused: string | undefined;
  const muted = () => (stack.length ? stack[stack.length - 1].current : false);
  const note = (m: string) => {
    if (!diagnostics.includes(m)) diagnostics.push(m);
  };
  const add = (name: string, kind: ParamKind, off = muted()) => {
    if (off) return;
    const existing = params.get(name);
    if (!existing) params.set(name, { name, kind });
    else if (existing.kind === kind || kind === "string") return;
    else if (existing.kind === "string") existing.kind = kind;
    else note(`{${name}} is used as ${existing.kind} and as ${kind}; kept ${existing.kind}`);
  };

  const P: Scan = {
    s: text,
    i: 0,
    k: undefined,
    o: (event, name, type) => {
      refused = undefined;
      if (event === 0) add(name, "string");
      else if (event === 1) {
        const kind = KINDS[type as string];
        // Core fails right after this event for anything but a choice kind.
        if (kind !== "plural" && kind !== "selectordinal" && kind !== "select")
          refused = type || undefined;
        if (!kind) {
          // Core fails right after this event; the platform types it as a string.
          if (type) {
            note(`{${name}, ${type}} is not a supported argument type; typed as a string`);
            add(name, "string");
          }
        } else if (kind === "plural" || kind === "selectordinal" || kind === "select") {
          const m = muted();
          const entry: ReadChoice | undefined = m ? undefined : { name, kind, selectors: [] };
          if (entry) choices.push(entry);
          stack.push({ name, kind, selectors: [], entry, muted: m, current: m, added: false });
        } else add(name, kind);
      } else if (event === 2) {
        const top = stack[stack.length - 1];
        if (!top.added) add(top.name, top.kind, top.muted);
        top.added = true;
        const repeated = top.selectors.includes(name);
        if (!repeated) {
          top.selectors.push(name);
          top.entry?.selectors.push(name);
        }
        top.current = top.muted || repeated;
      } else if (event === 3) {
        const top = stack.pop()!;
        if (!top.added) add(top.name, top.kind, top.muted);
        const hasOther = top.selectors.includes("other");
        if (!hasOther) note(`{${top.name}, ${top.kind}} has no "other" branch`);
        if (top.kind !== "select" || top.muted) return;
        const param = params.get(top.name);
        if (!param || param.kind !== "select") return;
        const options = top.selectors.filter((s) => s !== "other");
        if (param.options === undefined) {
          param.options = options;
          param.other = hasOther;
        } else {
          for (const o of options) if (!param.options.includes(o)) param.options.push(o);
          param.other = param.other === true && hasOther;
        }
      } else if (!muted() && !tags.includes(name)) tags.push(name);
    },
  };

  let error: string | undefined;
  let unsupported: string | undefined;
  try {
    message(P, false, false, false);
  } catch (e) {
    if (e !== SYNTAX) throw e;
    error = SYNTAX.m ?? "syntax error";
    // A selector outside core's grammar (`=x`, `=1e3`) refuses the choice's own kind.
    unsupported =
      refused ?? (/^invalid selector /.test(error) ? stack[stack.length - 1]?.kind : undefined);
  }
  const out: ReadMessage = { params: [...params.values()], tags, choices, diagnostics };
  if (error !== undefined) out.error = error;
  if (unsupported !== undefined) out.unsupported = unsupported;
  return out;
}
