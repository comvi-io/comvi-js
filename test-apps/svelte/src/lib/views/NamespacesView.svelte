<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const r = useI18n();
  const t = r.t;
  // A component's useI18n('admin') loads the namespace and holds it while it shows.
  const admin = useI18n('admin');
</script>

<div class="space-y-8">
  <div class="flex justify-between items-start">
    <h2 class="text-2xl font-bold">{t('namespaces.title')}</h2>
    <span
      class="px-2 py-1 rounded text-xs font-mono {admin.isReady
        ? 'bg-green-100 text-green-800'
        : 'bg-gray-100 text-gray-800'}"
    >
      Admin NS: {admin.isReady ? 'LOADED' : 'NOT LOADED'}
    </span>
  </div>

  <div class="p-6 border rounded-lg bg-white space-y-4">
    <p>{t('namespaces.description')}</p>

    {#if !admin.isReady}
      <p class="text-gray-500">{admin.isLoading ? t('common.loading') : t('namespaces.load_admin')}</p>
    {:else}
      <div class="space-y-4 border-t pt-4 mt-4">
        <h3 class="font-bold text-lg text-purple-600">
          {admin.t('welcome_admin')}
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {admin.t('dashboard')}
          </div>
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {admin.t('settings')}
          </div>
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {admin.t('users')}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
