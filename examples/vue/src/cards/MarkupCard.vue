<script setup lang="ts">
import { T } from "@comvi/vue";
import FeatureCard from "../components/FeatureCard.vue";
</script>

<template>
  <FeatureCard feature="tags">
    <!-- The catalog wraps words in <link>…</link>; the slot of the same name
         decides that a link is an <a>. The translator moves the words, the app
         keeps the markup. -->
    <p class="widget" data-testid="read-more">
      <T i18n-key="docs.read_more">
        <template #link="{ children }">
          <a href="https://comvi.io/docs" target="_blank" rel="noreferrer">{{ children }}</a>
        </template>
      </T>
    </p>
  </FeatureCard>
</template>
