<!-- Templates without generated catalogs: any key, any params (vue-tsc, `pnpm test:types`). -->
<script setup lang="ts">
import { h } from "vue";
import { T, type Children } from "../../src";
</script>

<template>
  <p>{{ $t("any.key", { n: 1 }) }}</p>
  <T i18n-key="whatever" :n="1" ns="x" :components="{ b: 'strong' }">
    <template #link="{ children }"
      ><a>{{ children }}</a></template
    >
  </T>
  <!-- A handler gets Children (an array around nested tags), not always a string. -->
  <!-- @vue-expect-error a string-only handler would throw on nested markup -->
  <T i18n-key="message" :b="(c: string) => c.toUpperCase()" />
  <T i18n-key="message" :b="(c: Children) => h('b', c)" />
  <T i18n-key="message" :b="(c) => h('b', c)" />
</template>
