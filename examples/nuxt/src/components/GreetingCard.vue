<script setup lang="ts">
const { t } = useI18n();

// Starts from `?name=…` in the address bar, then follows what you type. Either
// way it is rendered as text and never as markup: try `?name=<b>Grace</b>`.
// `useState` carries the server's starting value into the browser.
const route = useRoute();
const name = useState("name", () =>
  typeof route.query.name === "string" ? route.query.name : "Ada",
);
</script>

<template>
  <FeatureCard :title="t('demo.interpolation.title')" :body="t('demo.interpolation.body')">
    <label class="field">
      <span>{{ t("demo.interpolation.label") }}</span>
      <input v-model="name" data-testid="name-input" type="text" autocomplete="off" />
    </label>
    <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
  </FeatureCard>
</template>
