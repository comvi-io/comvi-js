<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import { fetched } from "../i18n";

const { t } = useI18n();
</script>

<template>
  <code>{{ t("demo.lazy.namespaces", { namespaces: fetched.namespaces.join(", ") }) }}</code>
</template>
