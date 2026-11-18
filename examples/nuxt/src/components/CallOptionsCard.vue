<script setup lang="ts">
const { t } = useI18n();
// The `locale` call option reads another catalog without switching to it.
// Only the catalogs in place are listed: pick a language and it joins the list.
const { locales } = useCatalogsInPlace();
</script>

<template>
  <FeatureCard :title="t('demo.options.title')" :body="t('demo.options.body')">
    <ul class="widget language-list">
      <li v-for="code in locales()" :key="code" :lang="code" dir="auto">
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
