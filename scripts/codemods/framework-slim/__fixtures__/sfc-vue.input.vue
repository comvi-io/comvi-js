<!-- Language row — .vue script block, extracted and remapped. -->
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, reloadTranslations, onMissingKey } = useI18n("panel");
</script>

<template>
  <button @click="reloadTranslations()">{{ t("reload") }}</button>
</template>
