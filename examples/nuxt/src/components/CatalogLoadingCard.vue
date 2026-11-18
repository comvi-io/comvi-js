<script setup lang="ts">
const { t } = useI18n();
const { locales, inPlace } = useCatalogsInPlace();
</script>

<template>
  <FeatureCard :title="t('demo.lazy.title')" :body="t('demo.lazy.body')">
    <div class="network">
      <code data-testid="fetched">{{
        t("loader.fetched", { locales: locales().join(", ") })
      }}</code>
      <code>{{
        t("demo.lazy.namespaces", {
          namespaces: inPlace("account") ? "default, account" : "default",
        })
      }}</code>
    </div>
  </FeatureCard>
</template>
