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
// Ordinary navigations of the user's own code (the e2e runs them while a switch loads).
const router = useRouter();
const toPlurals = () => localePath("/plurals");
const goPlurals = async () => {
  await navigateTo(toPlurals());
};
const pickLocale = (event: Event) =>
  navigateTo(switchLocalePath((event.target as HTMLSelectElement).value));
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
      <NuxtLinkLocale data-testid="link-uk" to="/admin" locale="uk">uk admin</NuxtLinkLocale>
      <button data-testid="direct-uk" @click="setLocale('uk')">uk</button>
      <button data-testid="push-plurals" @click="router.push(toPlurals())">push</button>
      <button data-testid="goto-plurals" @click="navigateTo(toPlurals())">goto</button>
      <button data-testid="await-goto-plurals" @click="goPlurals">await goto</button>
      <select data-testid="select-locale" :value="locale" @change="pickLocale">
        <option v-for="l in SWITCHES" :key="l" :value="l">{{ l }}</option>
      </select>
      <button data-testid="layout-count" @click="count++">{{ count }}</button>
    </nav>
    <main><NuxtPage /></main>
  </div>
</template>
