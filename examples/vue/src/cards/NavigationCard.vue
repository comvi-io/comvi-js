<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="navigation">
    <p class="widget">
      <RouterLink data-testid="nav-about" to="/about">{{ t("demo.navigation.cta") }}</RouterLink>
    </p>
  </FeatureCard>
</template>
