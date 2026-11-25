<script setup lang="ts">
import { useI18n } from "@comvi/vue";

// What a failed load shows: the problem, in the language on screen, and a way to ask again.
defineEmits<{ retry: [] }>();

const { t } = useI18n();
</script>

<template>
  <p class="note" role="alert" data-testid="load-error">
    {{ t("app.load_failed") }}
    <button type="button" data-testid="load-retry" @click="$emit('retry')">
      {{ t("app.retry") }}
    </button>
  </p>
</template>
