<script setup lang="ts">
// `failed`: the page could not load the `account` namespace; `retry` asks it to try again.
defineProps<{ failed: boolean }>();
defineEmits<{ retry: [] }>();

const { t } = useI18n();

// Scoped to the `account` namespace; the page that renders this card loads it.
const { t: tAccount } = useI18n("account");

const name = useVisitorName();
</script>

<template>
  <FeatureCard :title="t('demo.navigation.title')">
    <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
    <LoadError v-if="failed" @retry="$emit('retry')" />
    <template v-else>
      <!-- prettier-ignore -->
      <p class="widget" data-testid="account-signed-in">{{ tAccount("profile.signed_in", { name }) }}</p>
      <!-- prettier-ignore -->
      <p class="widget" data-testid="account-devices">{{ tAccount("profile.devices", { count: 3 }) }}</p>
      <!-- Only the English account catalog has this key: fallback stays inside the namespace. -->
      <p class="widget" data-testid="account-only-en">{{ tAccount("profile.only_en") }}</p>
    </template>
    <p class="widget">
      <NuxtLinkLocale class="cta" data-testid="nav-home" to="/features">{{
        t("nav.home")
      }}</NuxtLinkLocale>
    </p>
  </FeatureCard>
</template>
