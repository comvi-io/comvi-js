<!-- Templates without generated catalogs: any key, any params (vue-tsc, `pnpm test:types`). -->
<script setup lang="ts">
import { T } from "../../src";
</script>

<template>
  <p>{{ $t("any.key", { n: 1 }) }}</p>
  <T i18n-key="whatever" :n="1" ns="x">
    <template #link="{ children }"
      ><a>{{ children }}</a></template
    >
  </T>
</template>
