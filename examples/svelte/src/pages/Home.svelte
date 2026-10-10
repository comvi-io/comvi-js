<script lang="ts">
  import GreetingCard from '../cards/GreetingCard.svelte';
  import PluralCard from '../cards/PluralCard.svelte';
  import OrdinalCard from '../cards/OrdinalCard.svelte';
  import SelectCard from '../cards/SelectCard.svelte';
  import TagsCard from '../cards/TagsCard.svelte';
  import FormattingCard from '../cards/FormattingCard.svelte';
  import LazyCard from '../cards/LazyCard.svelte';
  import CallOptionsCard from '../cards/CallOptionsCard.svelte';
  import FallbackCard from '../cards/FallbackCard.svelte';
  import MissingParamCard from '../cards/MissingParamCard.svelte';
  import ErrorsCard from '../cards/ErrorsCard.svelte';
  import NavigationCard from '../cards/NavigationCard.svelte';

  // Shared by the plural and the ordinal card.
  let count = $state(2);
</script>

<div class="cards">
  <GreetingCard />
  <PluralCard bind:count />
  <OrdinalCard {count} />
  <SelectCard />
  <TagsCard />
  <FormattingCard />
  <LazyCard />
  <CallOptionsCard />
  <FallbackCard />
  <MissingParamCard />
  <ErrorsCard />
  <NavigationCard />
</div>
