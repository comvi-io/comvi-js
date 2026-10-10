<script setup lang="ts">
const { t, loadedLocales, activeNamespaces } = useI18n();
</script>

<template>
  <FeatureCard :title="t('demo.lazy.title')" :body="t('demo.lazy.body')">
    <!-- The server builds one instance per request, so what has been fetched
         is a fact about this browser: render it only there. -->
    <ClientOnly>
      <div class="network">
        <code data-testid="fetched">{{
          t("loader.fetched", { locales: loadedLocales.join(", ") })
        }}</code>
        <code>{{ t("demo.lazy.namespaces", { namespaces: activeNamespaces.join(", ") }) }}</code>
      </div>
      <template #fallback>
        <div class="network" />
      </template>
    </ClientOnly>
  </FeatureCard>
</template>
