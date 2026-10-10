<script setup lang="ts">
const { t } = useI18n();

// `useState` rather than `ref`: switching the locale navigates to another
// URL, and shared state survives that (and the trip from server to browser).
const count = useState("count", () => 2);
</script>

<template>
  <FeatureCard :title="t('demo.plural.title')" :body="t('demo.plural.body')">
    <div class="widget counter">
      <button class="step" data-testid="cart-dec" @click="count = Math.max(0, count - 1)">−</button>
      <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
      <button class="step" data-testid="cart-inc" @click="count++">+</button>
    </div>
  </FeatureCard>
</template>
