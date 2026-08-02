<!-- Language row — .vue script block, extracted and remapped. -->
<script setup lang="ts">
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/vue";

const { t } = useI18n("panel");
const { reloadTranslations } = useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>

<template>
  <button @click="reloadTranslations()">{{ t("reload") }}</button>
</template>
