<script setup lang="ts">
import { T } from "@comvi/vue";
import DocsLink from "../components/DocsLink.vue";
import FeatureCard from "../components/FeatureCard.vue";
</script>

<template>
  <FeatureCard feature="tags">
    <!-- The catalog wraps words in <link>…</link>; `components` decides that a link is
         a DocsLink. The translator moves the words, the app keeps the markup. -->
    <p class="widget" data-testid="read-more">
      <T i18n-key="docs.read_more" :components="{ link: DocsLink }" />
    </p>
  </FeatureCard>
</template>
