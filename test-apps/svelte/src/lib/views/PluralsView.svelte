<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const { t } = useI18n();

  let notificationCount = 0;
  let itemCount = 1;
</script>

<div class="space-y-8">
  <h2 class="text-2xl font-bold">{$t('plurals.title')}</h2>

  <!-- Notifications Example -->
  <div class="space-y-4 p-6 border rounded-lg bg-gray-50">
    <h3 class="font-semibold text-lg">Notifications (ICU Plural)</h3>
    <div class="flex flex-wrap gap-2">
      {#each [0, 1, 2, 5, 10] as n (n)}
        <button
          on:click={() => (notificationCount = n)}
          class="px-3 py-1 rounded bg-white border shadow-sm hover:bg-gray-50 {notificationCount === n
            ? 'ring-2 ring-blue-500 border-blue-500'
            : ''}"
        >
          {n}
        </button>
      {/each}
    </div>
    <p class="text-xl font-medium text-blue-600">
      {$t('plurals.notifications', { count: notificationCount })}
    </p>
  </div>

  <!-- Cart Items Example -->
  <div class="space-y-4 p-6 border rounded-lg bg-gray-50">
    <h3 class="font-semibold text-lg">Shopping Cart</h3>
    <div class="flex items-center gap-4">
      <input
        type="range"
        min="0"
        max="10"
        bind:value={itemCount}
        class="w-full max-w-xs"
      />
      <span class="font-mono w-8">{itemCount}</span>
    </div>
    <p class="text-xl font-medium text-green-600">
      {$t('plurals.items', { count: itemCount })}
    </p>
  </div>
</div>
