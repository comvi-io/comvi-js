<script setup lang="ts">
// `<html lang dir>` comes from the module (`comvi.head`, on by default); the SEO links from
// `useLocaleHead()`.
const { t, locale, setLocale } = useI18n();
const switchLocalePath = useSwitchLocalePath();
const localePath = useLocalePath();
useLocaleHead({ baseUrl: "https://example.com" });
// Layout state the e2e expects to survive navigations and locale switches (no remount).
const count = ref(0);
const SWITCHES = ["en", "uk", "de", "fr", "de-AT"];
</script>

<template>
  <div>
    <nav>
      <span data-testid="nav-locale">{{ locale }}</span>
      <NuxtLinkLocale data-testid="nav-home" to="/">{{ t("nav.home") }}</NuxtLinkLocale>
      <NuxtLink data-testid="nav-admin" :to="localePath('/admin')">admin</NuxtLink>
      <NuxtLink data-testid="nav-account" :to="localePath('/account')">account</NuxtLink>
      <NuxtLink data-testid="nav-plurals" :to="localePath('/plurals')">{{
        t("nav.plurals")
      }}</NuxtLink>
      <NuxtLink
        v-for="l in SWITCHES"
        :key="l"
        :data-testid="`switch-${l}`"
        :to="switchLocalePath(l)"
        >{{ l }}</NuxtLink
      >
      <button data-testid="direct-uk" @click="setLocale('uk').catch(() => {})">uk</button>
      <button data-testid="layout-count" @click="count++">{{ count }}</button>
    </nav>
    <main><NuxtPage /></main>
  </div>
</template>
