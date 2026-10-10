<script setup lang="ts">
const { t } = useI18n();

const registers = ["formal", "informal"] as const;
const formality = useState<(typeof registers)[number]>("formality", () => "formal");
</script>

<template>
  <FeatureCard :title="t('demo.formality.title')" :body="t('demo.formality.body')">
    <div class="options">
      <button
        v-for="value in registers"
        :key="value"
        class="chip"
        :aria-pressed="formality === value"
        @click="formality = value"
      >
        {{ t(`demo.formality.${value}`) }}
      </button>
    </div>
    <p class="widget" data-testid="formality-message">
      {{ t("demo.formality.message", { formality }) }}
    </p>
  </FeatureCard>
</template>
