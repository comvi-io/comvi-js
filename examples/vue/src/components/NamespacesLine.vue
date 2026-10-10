<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// A computed ref: it updates when a page activates another namespace.
const { t, activeNamespaces } = useI18n();
</script>

<template>
  <code>{{ t("demo.lazy.namespaces", { namespaces: activeNamespaces.join(", ") }) }}</code>
</template>
