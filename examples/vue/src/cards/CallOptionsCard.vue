<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
import { locales } from "../i18n";

const { t, loadedLocales } = useI18n();

// The `locale` call option reads another catalog without switching to it.
// Only downloaded catalogs are listed: pick a language and it joins the list.
const loaded = computed(() => locales.filter((code) => loadedLocales.value.includes(code)));
</script>

<template>
  <FeatureCard feature="options">
    <ul class="widget languages">
      <li v-for="code in loaded" :key="code" :lang="code" dir="auto">
        {{
          t("demo.options.inOwn", {
            name: t("demo.options.name", { locale: code }),
            locale: code,
          })
        }}
      </li>
    </ul>
  </FeatureCard>
</template>
