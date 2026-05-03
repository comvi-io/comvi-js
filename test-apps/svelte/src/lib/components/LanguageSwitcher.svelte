<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const { locale, setLocale } = useI18n();

  const locales = ['en', 'de', 'fr', 'es', 'uk', 'ar'];

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    setLocale(target.value);
  }
</script>

<select
  value={$locale}
  on:change={handleChange}
  class="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
>
  {#each locales as loc (loc)}
    <option value={loc}>{loc.toUpperCase()}</option>
  {/each}
</select>
