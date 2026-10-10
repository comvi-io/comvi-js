<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// One feature: its name, one sentence about it, then the live widget.
defineProps<{ feature: string }>();
const { t } = useI18n();
</script>

<template>
  <article class="card">
    <h2 class="eyebrow">{{ t(`demo.${feature}.title`) }}</h2>
    <p class="body">{{ t(`demo.${feature}.body`) }}</p>
    <slot />
  </article>
</template>
