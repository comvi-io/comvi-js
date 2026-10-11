<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// A feature's name and one sentence about it, above its live example.
defineProps<{
  feature:
    | "interpolation"
    | "plural"
    | "ordinal"
    | "select"
    | "formality"
    | "tags"
    | "formatting"
    | "lazy"
    | "options"
    | "errors"
    | "fallback"
    | "missing"
    | "navigation";
}>();
const { t } = useI18n();
</script>

<template>
  <article class="card">
    <h2 class="eyebrow">{{ t(`demo.${feature}.title`) }}</h2>
    <p class="body">{{ t(`demo.${feature}.body`) }}</p>
    <slot />
  </article>
</template>
