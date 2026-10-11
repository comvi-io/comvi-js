<script setup lang="ts" generic="Value extends string">
// A row of toggle chips that picks one value.
defineProps<{ values: readonly Value[]; label: (value: Value) => string }>();
const model = defineModel<Value>({ required: true });
</script>

<template>
  <div class="options">
    <button
      v-for="option in values"
      :key="option"
      class="chip"
      :aria-pressed="model === option"
      @click="model = option"
    >
      {{ label(option) }}
    </button>
  </div>
</template>
