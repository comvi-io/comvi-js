/**
 * F18 (Q5): `<T raw>` -> `<T skipPostProcess>`. `raw` stays a deprecated alias
 * for one release, so the codemod's job is purely mechanical — flip the prop
 * name on every `<T>` JSX element it can PROVE is the Comvi component.
 *
 * JSX only: react's and solid's `<T>` is a JSX element this codemod's
 * tree-sitter grammars parse directly. `.vue` and `.svelte` write `raw` on a
 * `<T>` in TEMPLATE markup, which this codemod never parses (only their
 * `<script>` blocks are — see `extractScriptBlocks`), so those occurrences are
 * detected by `findSfcTemplateRawT` below and reported, never rewritten.
 */
import { namedImports, localDeclarations } from "./imports.mjs";

/** Modules whose `T` export is JSX — the only shape this rule can rewrite. */
export const T_JSX_MODULES = new Set(["@comvi/react", "@comvi/solid"]);

const RAW_PROP = "raw";
const SKIP_POST_PROCESS_PROP = "skipPostProcess";

/**
 * Renames the `raw` prop to `skipPostProcess` on every `<T>` JSX element whose
 * tag name is a value import of `T` from a JSX binding root ({@link
 * T_JSX_MODULES}). `tRaw` is a different member entirely and is never touched
 * — this rule only ever looks at JSX attribute names, never at identifiers.
 *
 * A local declaration that shadows the imported name — `function T() {}`,
 * `const { T } = …` — refuses EVERY `<T raw>` in the module: once the name
 * means two things the text cannot say which element the import covers.
 */
export function planTPropRename(root) {
  const tImports = namedImports(root).filter(
    (entry) => entry.imported === "T" && !entry.typeOnly && T_JSX_MODULES.has(entry.source),
  );
  if (tImports.length === 0) return { edits: [], rewrites: 0, manual: [] };

  const locals = new Set(tImports.map((entry) => entry.local));
  const manual = [];
  for (const local of locals) {
    for (const node of localDeclarations(root, local)) {
      manual.push({
        offset: node.range().start.index,
        shape: "shadowed-t-component",
        detail: `\`${local}\` is imported as the <T> component AND declared locally in this module — every <${local} raw> here is left alone; rename the local binding and re-run`,
      });
    }
  }
  if (manual.length > 0) return { edits: [], rewrites: 0, manual };

  const edits = [];
  let rewrites = 0;
  const elements = [
    ...root.findAll({ rule: { kind: "jsx_opening_element" } }),
    ...root.findAll({ rule: { kind: "jsx_self_closing_element" } }),
  ];
  for (const element of elements) {
    // `.field("name")` on a `jsx_*_element` reliably returns the tag-name
    // node in this grammar; the same call on a `jsx_attribute` does not (it
    // is always `null` here) — that asymmetry is why the attribute name below
    // is read from `children()[0]` instead.
    const name = element.field("name");
    if (name === null || name.kind() !== "identifier" || !locals.has(name.text())) continue;
    const elementRange = element.range();
    // Every `jsx_attribute` anywhere under this element, filtered down to the
    // ones whose PARENT is this exact element: an unfiltered `findAll` would
    // also reach into an attribute's VALUE (`<T tooltip={<Foo raw />} />`),
    // renaming a different element's `raw` prop by accident. Range equality
    // stands in for identity, since a re-fetched node is a new wrapper object.
    for (const attr of element.findAll({ rule: { kind: "jsx_attribute" } })) {
      const parent = attr.parent();
      if (parent === null) continue;
      const parentRange = parent.range();
      if (
        parentRange.start.index !== elementRange.start.index ||
        parentRange.end.index !== elementRange.end.index
      ) {
        continue;
      }
      const attrName = attr.children()[0];
      if (attrName === undefined || attrName.text() !== RAW_PROP) continue;
      const range = attrName.range();
      edits.push({
        start: range.start.index,
        end: range.end.index,
        text: SKIP_POST_PROCESS_PROP,
      });
      rewrites += 1;
    }
  }
  return { edits, rewrites, manual: [] };
}

/**
 * A `<T ... raw ...>` occurrence in a `.vue` / `.svelte` TEMPLATE (outside
 * every `<script>` block) — where the codemod cannot parse well enough to
 * rewrite, so it reports instead. Matches `<T` as a tag name (word boundary,
 * so `<Text>` and `<TFoo>` are not mistaken for it) with a standalone `raw`
 * attribute token before the tag's closing `>` — plain `raw`, Vue's `:raw=` /
 * `v-bind:raw=`, or a bare `raw={…}` (svelte).
 *
 * A regex, not the tree-sitter grammars this codemod otherwise uses: neither
 * Vue's nor Svelte's template syntax is one of them, and a best-effort scan
 * that only ever REPORTS (never rewrites) does not need a real parser to be
 * safe — a false positive costs the user one look, a missed one costs nothing
 * since it degrades to what nothing but a human already knew.
 *
 * @param {string} source Full SFC source.
 * @param {Array<{offset: number, body: string}>} scriptBlocks From
 *   `extractScriptBlocks` — their ranges are excluded, since `raw` inside a
 *   `<script>` string or comment is not a template attribute.
 * @returns {Array<{ offset: number, shape: string, detail: string }>}
 */
export function findSfcTemplateRawT(source, scriptBlocks) {
  const excluded = scriptBlocks.map((block) => [block.offset, block.offset + block.body.length]);
  // HTML comments too — `<!-- <T raw> is deprecated -->` describes a `<T
  // raw>`, it is not one, and file-header comments (this codemod's own
  // fixtures included) routinely say the words for exactly that reason.
  const COMMENT = /<!--[\s\S]*?-->/g;
  let comment;
  while ((comment = COMMENT.exec(source)) !== null) {
    excluded.push([comment.index, comment.index + comment[0].length]);
  }
  const isExcluded = (index) => excluded.some(([start, end]) => index >= start && index < end);

  const findings = [];
  const TAG_OPEN = /<T(?=[\s/>])/g;
  let tagMatch;
  while ((tagMatch = TAG_OPEN.exec(source)) !== null) {
    if (isExcluded(tagMatch.index)) continue;
    const tagEnd = source.indexOf(">", tagMatch.index);
    if (tagEnd === -1) continue;
    const tagText = source.slice(tagMatch.index, tagEnd + 1);
    // The prefix is WHITESPACE only, never a quote: attributes are
    // whitespace-separated, so `"` or `'` there means `raw` is the first word
    // of a PRECEDING attribute's quoted VALUE (`fallback="raw text"`), not a
    // prop name.
    const rawAttr = /(?:^|\s)(?::|v-bind:)?raw(?=[\s=/>])/.exec(tagText.slice(2 /* "<T" */));
    if (rawAttr === null) continue;
    findings.push({
      offset: tagMatch.index,
      shape: "sfc-template-raw-t",
      detail:
        "<T raw> in a .vue/.svelte template — this codemod does not parse template markup; " +
        "rename the prop to skipPostProcess by hand (raw keeps working, deprecated, until removed)",
    });
  }
  return findings;
}
