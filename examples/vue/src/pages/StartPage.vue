<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "@comvi/vue";
import { useVisitorName } from "../name";

const { t } = useI18n();
const name = useVisitorName();
</script>

<template>
  <div class="start">
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
    <p>
      <RouterLink class="cta" to="/features">{{ t("demo.start.cta") }}</RouterLink>
    </p>
  </div>
</template>
