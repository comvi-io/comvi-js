<!-- Report-only — `<T raw>` in TEMPLATE markup: this codemod's tree-sitter
     grammars parse `<script>` blocks only (see extractScriptBlocks), never
     `.vue` template syntax, so the occurrence is reported instead of
     rewritten. The bound `:raw` form is caught too; `rawText`, a `raw`
     substring inside an unrelated attribute's quoted value, and an unrelated
     `<Text>` tag are not. A `>` inside an attribute VALUE does not end the
     tag, so the `raw` after it is still found. -->
<script setup lang="ts">
import { T } from "@comvi/vue";
</script>

<template>
  <T i18n-key="greeting" raw />
  <T i18n-key="greeting" :raw="isEditorPreview" />
  <T i18n-key="greeting" fallback="raw text" />
  <T i18n-key="items" :count="a > b" raw />
  <Text raw="something" />
</template>
