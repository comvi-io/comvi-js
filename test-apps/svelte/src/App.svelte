<script lang="ts">
  import { onMount } from 'svelte';
  import { setI18nContext, useI18n } from '@comvi/svelte';
  import { i18n } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import HomeView from '$lib/views/HomeView.svelte';
  import PluralsView from '$lib/views/PluralsView.svelte';
  import RichTextView from '$lib/views/RichTextView.svelte';
  import NamespacesView from '$lib/views/NamespacesView.svelte';
  import RtlView from '$lib/views/RtlView.svelte';

  // Set i18n context for all child components
  setI18nContext(i18n);

  const { t, isLoading, locale } = useI18n();

  // Simple hash-based routing
  let currentPath = window.location.hash.slice(1) || '/';

  function navigate(path: string) {
    window.location.hash = path;
    currentPath = path;
  }

  onMount(() => {
    // Initialize i18n
    i18n.init().then(() => {
      const defaultNs = i18n.getDefaultNamespace();
      const activeNamespaces = i18n.getActiveNamespaces();
      if (!activeNamespaces.includes(defaultNs)) {
        i18n.addActiveNamespace(defaultNs);
      }
    });

    // Listen for hash changes
    const handleHashChange = () => {
      currentPath = window.location.hash.slice(1) || '/';
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  // Update document direction based on locale
  $: if (typeof document !== 'undefined') {
    document.documentElement.dir = $locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = $locale;
  }

  const navItems = [
    { path: '/', label: 'nav.home' },
    { path: '/plurals', label: 'nav.plurals' },
    { path: '/rich-text', label: 'nav.rich_text' },
    { path: '/namespaces', label: 'nav.namespaces' },
    { path: '/rtl', label: 'nav.rtl' },
  ] as const;
</script>

<div class="min-h-screen bg-gray-50 font-sans">
  <nav class="bg-white shadow mb-8 sticky top-0 z-50">
    <div class="container mx-auto px-4 py-4 flex justify-between items-center">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-bold text-blue-600">Comvi Svelte Example</h1>
      </div>
      <div class="flex gap-4 items-center">
        {#if $isLoading}
          <div class="text-sm text-gray-500 italic">
            {$t('common.loading')}
          </div>
        {/if}
        <LanguageSwitcher />
      </div>
    </div>
    <div class="container mx-auto px-4 border-t flex gap-2 overflow-x-auto py-2">
      {#each navItems as item (item.path)}
        <button
          on:click={() => navigate(item.path)}
          class="px-3 py-2 rounded text-sm hover:bg-gray-100 whitespace-nowrap transition-colors {currentPath === item.path
            ? 'bg-blue-50 text-blue-700 font-medium'
            : ''}"
        >
          {$t(item.label)}
        </button>
      {/each}
    </div>
  </nav>

  <main class="container mx-auto px-4 pb-12">
    <div class="bg-white rounded-lg shadow p-6 min-h-[300px]">
      {#if currentPath === '/'}
        <HomeView />
      {:else if currentPath === '/plurals'}
        <PluralsView />
      {:else if currentPath === '/rich-text'}
        <RichTextView />
      {:else if currentPath === '/namespaces'}
        <NamespacesView />
      {:else if currentPath === '/rtl'}
        <RtlView />
      {/if}
    </div>
  </main>
</div>
