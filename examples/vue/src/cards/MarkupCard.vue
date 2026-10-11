<script setup lang="ts">
import { T } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";

// The catalog wraps words in <link>…</link>; this component decides that a
// link is an <a>. Only <T> parses tags, so plain `t()` output stays text.
const components = {
  link: {
    component: "a",
    props: { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
  },
};
</script>

<template>
  <FeatureCard feature="tags">
    <p class="widget" data-testid="read-more">
      <T i18n-key="docs.read_more" :components="components" />
    </p>
  </FeatureCard>
</template>
