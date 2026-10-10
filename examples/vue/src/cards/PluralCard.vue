<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const count = defineModel<number>("count", { required: true });
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="plural">
    <div class="counter widget">
      <button data-testid="cart-dec" @click="count = Math.max(0, count - 1)">−</button>
      <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
      <button data-testid="cart-inc" @click="count++">+</button>
    </div>
  </FeatureCard>
</template>
