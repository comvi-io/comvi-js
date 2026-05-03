<script lang="ts">
  import { useI18n } from '@comvi/svelte';

  const { t } = useI18n();
</script>

<div class="space-y-6">
  <header class="border-b pb-4">
    <h2 class="text-2xl font-bold text-gray-900">{$t('home.title')}</h2>
    <p class="text-gray-600 mt-1">{$t('home.subtitle')}</p>
  </header>

  <div class="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
    <p class="text-lg text-blue-900">{$t('home.intro', { name: 'Developer' })}</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
    <div class="p-4 border rounded-lg">
      <h3 class="font-semibold mb-2">
        {$t('common.current_language', { lang: String($t('common.language_selector')) })}
      </h3>
      <p class="text-sm text-gray-500">
        Comvi i18n automatically handles language switching and reactivity.
      </p>
    </div>
  </div>
</div>
