<script setup lang="ts">
// The footer both pages share: where to read more, where this example lives,
// and the one package a Nuxt app installs.
const { t } = useI18n();
</script>

<template>
  <footer class="footer">
    <a href="https://comvi.io/docs/i18n" target="_blank" rel="noreferrer">{{
      t("demo.footer.docs")
    }}</a>
    <a
      href="https://github.com/comvi-io/comvi-js/tree/main/examples/nuxt"
      target="_blank"
      rel="noreferrer"
      >{{ t("demo.footer.source") }}</a
    >
    <span class="install">
      {{ t("demo.footer.install") }}
      <code>npm i @comvi/nuxt</code>
    </span>
  </footer>
</template>
