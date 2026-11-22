/**
 * Reads contracts/icu-grammar.json (B12): expands the compact `nest` strings and builds each
 * record's params: `values` plus the contract's handler for every tag-like name (or for the
 * record's own `handlers`). The rules are the file's `$comment`.
 */
import grammar from "../../../contracts/icu-grammar.json";

type Text =
  | string
  | { nest: { times: number; wrap: string[][]; inner: string; before?: string; after?: string } };

interface Raw {
  message: Text;
  render: Text | null;
  schema: { params: unknown[]; tags: string[] } | null;
  error: "syntax" | null;
  unclosed: string[];
  note?: string;
  values?: Record<string, string | number>;
  handlers?: string[];
}

export interface GrammarCase {
  message: string;
  render: string | null;
  schema: { params: unknown[]; tags: string[] } | null;
  error: "syntax" | null;
  unclosed: string[];
  params: Record<string, string | number | ((kids: readonly unknown[]) => string)>;
}

export const expand = (t: Text): string => {
  if (typeof t === "string") return t;
  const { times, wrap, inner, before = "", after = "" } = t.nest;
  let s = inner;
  for (let i = times - 1; i >= 0; i--) {
    const [open, close] = wrap[i % wrap.length];
    s = open + s + close;
  }
  return before + s + after;
};

/** `[name, case]` rows for `it.each`: a long message is named by its note. */
export const grammarCases = (): (readonly [string, GrammarCase])[] =>
  (grammar.cases as Raw[]).map((r) => {
    const message = expand(r.message);
    const params: GrammarCase["params"] = { ...(r.values ?? grammar.values) };
    const names = r.handlers ?? [...message.matchAll(/<\/?([A-Za-z][\w-]*)/g)].map((m) => m[1]);
    for (const name of names) params[name] = (kids) => `[${name}:${kids.join("")}]`;
    const c: GrammarCase = {
      message,
      render: r.render === null ? null : expand(r.render),
      schema: r.schema,
      error: r.error,
      unclosed: r.unclosed,
      params,
    };
    return [message.length > 60 || typeof r.message !== "string" ? r.note! : message, c] as const;
  });
