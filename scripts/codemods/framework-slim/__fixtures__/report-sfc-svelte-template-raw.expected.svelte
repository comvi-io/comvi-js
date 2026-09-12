<!-- Report-only — `<T raw>` in TEMPLATE markup: this codemod's tree-sitter
     grammars parse `<script>` blocks only (see extractScriptBlocks), never
     Svelte template syntax, so the occurrence is reported instead of
     rewritten. A valued `raw={…}` form is caught too; `rawText`, a `raw`
     substring inside an unrelated attribute's quoted value, and an unrelated
     `<Text>` tag are not. A `>` inside a braced expression does not end the
     tag, so the `raw` after it is still found. -->
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<T i18nKey="greeting" raw />
<T i18nKey="greeting" raw={isEditorPreview} />
<T i18nKey="greeting" fallback="raw text" />
<T i18nKey="items" count={a > b ? 2 : 1} raw />
<Text raw="something" />
