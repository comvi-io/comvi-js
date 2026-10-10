<script setup lang="ts">
const { t } = useI18n();

// The catalog says where the link goes in the sentence; the app says what a
// link is. A translator can move `<link>` but cannot inject markup.
const components = {
  link: {
    component: "a",
    props: { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
  },
};
</script>

<template>
  <FeatureCard :title="t('demo.tags.title')" :body="t('demo.tags.body')">
    <p class="widget" data-testid="read-more">
      <T i18n-key="docs.read_more" :components="components" />
    </p>
  </FeatureCard>
</template>
