/**
 * One key's wire entry from its messages in every locale — the platform's rule
 * (`buildWireKeyV2`, `platform/apps/api/src/modules/translations/typegen/schema-v2.ts`),
 * so a local directory and the platform route agree byte for byte:
 *
 * - the source locale's message is authoritative for params, kinds, select options,
 *   `other` and tags; every other locale is only compared with it (warnings);
 * - a key with no source message takes the union of the other locales, in code-point
 *   order: a choice kind wins over a plain `{x}`; between two different non-string kinds
 *   the first locale's wins (a warning); select options merge, `other` only if all have it;
 * - every locale's own syntax error and diagnostics are passed on as warnings.
 */
import type { ReadMessage, ReadParam } from "./read";
import { byCodeUnit, record, type WireKey, type WireParam } from "./wire";

export interface SchemaWarning {
  namespace: string;
  key: string;
  locale?: string;
  message: string;
}

const clone = (p: ReadParam): ReadParam => {
  const copy: ReadParam = { name: p.name, kind: p.kind };
  if (p.options) copy.options = [...p.options];
  if (p.other !== undefined) copy.other = p.other;
  return copy;
};

const ownProblems = (m: ReadMessage): string[] => [
  ...(m.error !== undefined ? [`syntax error: ${m.error}`] : []),
  ...m.diagnostics,
];

function compareWithSource(source: ReadMessage, target: ReadMessage): string[] {
  const problems: string[] = [];
  const sourceParams = new Map(source.params.map((p) => [p.name, p]));
  const targetNames = new Set(target.params.map((p) => p.name));
  // A message cut short by a syntax error has unread params, not missing ones.
  if (target.error === undefined)
    for (const name of sourceParams.keys())
      if (!targetNames.has(name)) problems.push(`{${name}} is missing here`);
  for (const p of target.params) {
    const expected = sourceParams.get(p.name);
    if (!expected) {
      problems.push(`{${p.name}} is not in the source message`);
      continue;
    }
    if (expected.kind !== p.kind) {
      problems.push(`{${p.name}} is ${p.kind} here but ${expected.kind} in the source`);
      continue;
    }
    if (p.kind === "select") {
      const extra = (p.options ?? []).filter((o) => !(expected.options ?? []).includes(o));
      if (extra.length > 0)
        problems.push(`{${p.name}} has options not in the source: ${extra.join(", ")}`);
    }
  }
  const extraTags = target.tags.filter((t) => !source.tags.includes(t));
  if (extraTags.length > 0)
    problems.push(`tags not in the source: ${extraTags.map((t) => `<${t}>`).join(", ")}`);
  problems.push(...ownProblems(target));
  return problems;
}

function toWireKey(params: ReadParam[], tags: string[]): WireKey {
  const entry: WireKey = {};
  if (params.length > 0) {
    const wire = record<WireParam>();
    for (const p of params) {
      const out: WireParam = { kind: p.kind };
      if (p.kind === "select") {
        out.options = [...(p.options ?? [])];
        out.other = p.other === true;
      }
      wire[p.name] = out;
    }
    entry.params = wire;
  }
  if (tags.length > 0) entry.tags = [...tags];
  return entry;
}

/** The wire entry of one key, plus what the source-locale rule found. */
export function buildWireKey(
  messages: Record<string, ReadMessage>,
  sourceLocale: string,
  where: { namespace: string; key: string },
): { entry: WireKey; warnings: SchemaWarning[] } {
  const warnings: SchemaWarning[] = [];
  const warn = (message: string, locale?: string) =>
    warnings.push(locale === undefined ? { ...where, message } : { ...where, locale, message });
  const codes = Object.keys(messages).sort(byCodeUnit);
  const source = Object.hasOwn(messages, sourceLocale) ? messages[sourceLocale] : undefined;

  if (!source) {
    if (codes.length === 0) return { entry: {}, warnings };
    warn(`no ${sourceLocale} (source) message; types come from the other locales`);
    const params = new Map<string, ReadParam>();
    const from = new Map<string, string>();
    const tags: string[] = [];
    for (const code of codes) {
      for (const p of messages[code].params) {
        const existing = params.get(p.name);
        if (!existing || (existing.kind === "string" && p.kind !== "string")) {
          params.set(p.name, clone(p));
          from.set(p.name, code);
        } else if (p.kind !== "string" && existing.kind !== p.kind) {
          warn(
            `{${p.name}} is ${p.kind} here but ${existing.kind} in ${from.get(p.name)}; kept ${existing.kind}`,
            code,
          );
        } else if (existing.kind === "select" && p.kind === "select") {
          existing.options ??= [];
          for (const o of p.options ?? [])
            if (!existing.options.includes(o)) existing.options.push(o);
          existing.other = existing.other === true && p.other === true;
        }
      }
      for (const t of messages[code].tags) if (!tags.includes(t)) tags.push(t);
    }
    // The platform reports each locale's own problems before the kind conflicts.
    const conflicts = warnings.splice(1);
    for (const code of codes)
      for (const problem of ownProblems(messages[code])) warn(problem, code);
    warnings.push(...conflicts);
    return { entry: toWireKey([...params.values()], tags), warnings };
  }

  for (const problem of ownProblems(source)) warn(problem, sourceLocale);
  for (const code of codes) {
    if (code === sourceLocale) continue;
    for (const problem of compareWithSource(source, messages[code])) warn(problem, code);
  }
  return { entry: toWireKey(source.params, source.tags), warnings };
}
