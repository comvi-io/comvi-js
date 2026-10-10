<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t } = useI18n();
</script>

<template>
  <footer>
    <a href="https://comvi.io/docs/i18n">{{ t("demo.footer.docs") }}</a>
    <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/vue">{{
      t("demo.footer.source")
    }}</a>
    <span>
      {{ t("demo.footer.install") }}
      <code>npm i @comvi/vue</code>
    </span>
  </footer>
</template>
