<script setup lang="ts">
import { ref } from "vue";
import { T, useI18n } from "@comvi/vue";

const { t } = useI18n();
const late = ref(false);
</script>

<template>
  <section id="region-A">
    <h1 id="A-title">{{ t("home.title") }}</h1>
    <p id="A-common">{{ t("save", { ns: "common" }) }}</p>
    <p id="A-missing">{{ t("missing.key") }}</p>
    <p id="A-rich"><T i18n-key="rich.terms" :components="{ b: 'b' }" /></p>
    <button id="more" type="button" @click="late = true">More</button>
    <p v-if="late" id="A-late">{{ t("nav.about") }}</p>
  </section>
</template>
