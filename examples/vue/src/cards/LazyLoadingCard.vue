<script setup lang="ts">
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
import NamespacesLine from "../components/NamespacesLine.vue";

// A computed ref: the list grows as you switch languages.
const { t, loadedLocales } = useI18n();
</script>

<template>
  <FeatureCard feature="lazy">
    <div class="net">
      <code data-testid="fetched">{{
        t("loader.fetched", { locales: loadedLocales.join(", ") })
      }}</code>
      <NamespacesLine />
    </div>
  </FeatureCard>
</template>
