<script setup lang="ts">
const { t } = useI18n();

// Scoped to the `account` namespace; the page that renders this card loads it.
const { t: tAccount } = useI18n("account");

const route = useRoute();
const name = computed(() => (typeof route.query.name === "string" ? route.query.name : "Ada"));
</script>

<template>
  <FeatureCard :title="t('demo.navigation.title')">
    <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
    <!-- prettier-ignore -->
    <p class="widget" data-testid="account-signed-in">{{ tAccount("profile.signed_in", { name }) }}</p>
    <!-- prettier-ignore -->
    <p class="widget" data-testid="account-devices">{{ tAccount("profile.devices", { count: 3 }) }}</p>
    <!-- Only the English account catalog has this key: fallback stays inside the namespace. -->
    <p class="widget" data-testid="account-only-en">{{ tAccount("profile.only_en") }}</p>
    <p class="widget">
      <NuxtLinkLocale class="cta" data-testid="nav-home" to="/">{{ t("nav.home") }}</NuxtLinkLocale>
    </p>
  </FeatureCard>
</template>
