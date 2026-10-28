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

export interface ReadMessage {
  params: ReadParam[];
  tags: string[];
  /** Core cannot compile the message: it renders the key and reports `syntax`. */
  error?: string;
  /** Things the schema settled that a translator should look at. */
  diagnostics: string[];
}

interface Choice {
  name: string;
  kind: "plural" | "selectordinal" | "select";
  selectors: string[];
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
      if (event === 0) add(name, "string");
      else if (event === 1) {
        const kind = KINDS[type as string];
        if (!kind) {
          // Core fails right after this event; the platform types it as a string.
          if (type) {
            note(`{${name}, ${type}} is not a supported argument type; typed as a string`);
            add(name, "string");
          }
        } else if (kind === "plural" || kind === "selectordinal" || kind === "select") {
          const m = muted();
          stack.push({ name, kind, selectors: [], muted: m, current: m, added: false });
        } else add(name, kind);
      } else if (event === 2) {
        const top = stack[stack.length - 1];
        if (!top.added) add(top.name, top.kind, top.muted);
        top.added = true;
        const repeated = top.selectors.includes(name);
        if (!repeated) top.selectors.push(name);
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
  try {
    message(P, false, false, false);
  } catch (e) {
    if (e !== SYNTAX) throw e;
    error = SYNTAX.m ?? "syntax error";
  }
  const out: ReadMessage = { params: [...params.values()], tags, diagnostics };
  if (error !== undefined) out.error = error;
  return out;
}
