<script setup lang="ts">
const { t, locales, loadedLocales } = useI18n();

// The `locale` call option reads another catalog without switching to it.
// Only downloaded catalogs are listed: pick a language and it joins the list.
const loaded = computed(() => locales.value.filter((code) => loadedLocales.value.includes(code)));
</script>

<template>
  <FeatureCard :title="t('demo.options.title')" :body="t('demo.options.body')">
    <!-- Which catalogs are downloaded is a fact about this browser. -->
    <ClientOnly>
      <ul class="widget language-list">
        <li v-for="code in loaded" :key="code" :lang="code" dir="auto">
          {{
            t("demo.options.inOwn", {
              name: t("demo.options.name", { locale: code }),
              locale: code,
            })
          }}
        </li>
      </ul>
    </ClientOnly>
  </FeatureCard>
</template>
