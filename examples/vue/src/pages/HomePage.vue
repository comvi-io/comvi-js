<script setup lang="ts">
import { ref } from "vue";
import CallOptionsCard from "../cards/CallOptionsCard.vue";
import ErrorsCard from "../cards/ErrorsCard.vue";
import FallbackCard from "../cards/FallbackCard.vue";
import FormalityCard from "../cards/FormalityCard.vue";
import FormattingCard from "../cards/FormattingCard.vue";
import GreetingCard from "../cards/GreetingCard.vue";
import LazyLoadingCard from "../cards/LazyLoadingCard.vue";
import MarkupCard from "../cards/MarkupCard.vue";
import MissingParamCard from "../cards/MissingParamCard.vue";
import NavigationCard from "../cards/NavigationCard.vue";
import OrdinalCard from "../cards/OrdinalCard.vue";
import PluralCard from "../cards/PluralCard.vue";
import SelectCard from "../cards/SelectCard.vue";

defineProps<{ name: string }>();

// The plural and ordinal cards read the same number.
const count = ref(2);
</script>

<template>
  <div class="cards">
    <GreetingCard :name="name" />
    <PluralCard v-model:count="count" />
    <OrdinalCard :count="count" />
    <SelectCard />
    <FormalityCard />
    <MarkupCard />
    <FormattingCard />
    <CallOptionsCard />
    <FallbackCard />
    <MissingParamCard />
    <ErrorsCard />
    <NavigationCard />
    <LazyLoadingCard />
  </div>
</template>
