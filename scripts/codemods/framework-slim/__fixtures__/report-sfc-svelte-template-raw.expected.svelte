<!-- Report-only — `<T raw>` in TEMPLATE markup: this codemod's tree-sitter
     grammars parse `<script>` blocks only (see extractScriptBlocks), never
     Svelte template syntax, so the occurrence is reported instead of
     rewritten. A valued `raw={…}` form is caught too; `rawText`, a `raw`
     substring inside an unrelated attribute's quoted value, and an unrelated
     `<Text>` tag are not. -->
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<T i18nKey="greeting" raw />
<T i18nKey="greeting" raw={isEditorPreview} />
<T i18nKey="greeting" fallback="raw text" />
<Text raw="something" />
