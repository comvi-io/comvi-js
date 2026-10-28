<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
import NamespacesLine from "../components/NamespacesLine.vue";
import { fetched } from "../i18n";

// The list grows as you switch languages: each one is fetched the first time.
const { t } = useI18n();
</script>

<template>
  <FeatureCard feature="lazy">
    <div class="net">
      <code data-testid="fetched">{{
        t("loader.fetched", { locales: fetched.locales.join(", ") })
      }}</code>
      <NamespacesLine />
    </div>
  </FeatureCard>
</template>
