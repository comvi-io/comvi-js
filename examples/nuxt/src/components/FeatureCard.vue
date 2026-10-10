<script setup lang="ts">
defineProps<{ title: string; body?: string }>();
</script>

<template>
  <section class="card">
    <h2 class="eyebrow">{{ title }}</h2>
    <p v-if="body" class="body">{{ body }}</p>
    <slot />
  </section>
</template>
