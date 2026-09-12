<script lang="ts">
  // The PURE rich-text seam, NOT '@comvi/core/tags': importing the tags entry
  // would register tag syntax AMBIENTLY, so every app rendering <T> would also
  // start parsing `<tag>` markup in plain string-API `t()`. prepareTranslation
  // passes the tag extension per call, so the ambient switch stays the app's.
  import { prepareTranslation } from '@comvi/core/rich-text';
  import type { PendingHandler } from '@comvi/core/rich-text';
  import type { Component } from 'svelte';
  import type { VirtualNode } from '@comvi/core';
  import { useI18nHost } from './context.js';
  import { createLocaleStore, createCacheRevisionStore } from './stores.js';
  import type { TProps } from './types';

  // Every prop that is not declared here is an interpolation param, matching
  // the react wrapper: `<T i18nKey="cart" count={2} />` is `params: { count: 2 }`.
  let {
    i18nKey,
    params = {},
    ns = undefined,
    locale = undefined,
    fallback = undefined,
    raw = undefined,
    components = undefined,
    children = undefined,
    ...directParams
  }: TProps = $props();

  const i18n = useI18nHost();
  const languageStore = createLocaleStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);

  const prepared = $derived.by(() => {
    // This read IS the reactive dependency for the cache/config axis.
    void $cacheRevision;
    // The locale axis is a dependency only when the locale is NOT pinned:
    // reading `$languageStore` outside this branch would register the
    // dependency anyway, and a `<T locale="de">` would recompute on every
    // global locale change whose answer it cannot depend on.
    if (locale === undefined) {
      void $languageStore;
    }

    // The spread is what SUBSCRIBES to each direct param, so it happens inside
    // the derived. A direct prop wins a name collision with `params`, as in react.
    const allParams =
      Object.keys(directParams).length === 0 ? params : { ...params, ...directParams };

    return prepareTranslation(i18n, {
      i18nKey: i18nKey as string,
      params: allParams,
      ns,
      locale,
      fallback,
      raw,
      components,
    });
  });

  const pendingByTag = $derived.by(() => {
    const byTag: Record<string, PendingHandler> = Object.create(null);
    for (const pending of prepared.pendingHandlers) {
      byTag[pending.marker] = pending;
    }
    return byTag;
  });

  const renderSlot = $derived(prepared.isMissing && children != null);

  // A boolean `false` prop means "omit the attribute", as in the other
  // wrappers; a `<svelte:element>` spread would serialize it as `attr="false"`.
  function elementProps(props: Record<string, unknown>): Record<string, unknown> {
    let filtered: Record<string, unknown> | null = null;
    for (const name in props) {
      if (props[name] === false) {
        filtered ??= { ...props };
        delete filtered[name];
      }
    }
    return filtered ?? props;
  }
</script>

<!--
  Translation content can only ever produce text nodes and handler-mapped
  elements — there is no HTML string sink, so untrusted translations cannot
  inject markup.
-->
{#snippet renderList(items: Array<VirtualNode | string>)}
  {#each items as item, index (index)}
    {#if typeof item === 'string'}{item}{:else}{@render renderNode(item)}{/if}
  {/each}
{/snippet}

{#snippet renderNode(node: VirtualNode)}
  {#if node.type === 'text'}
    {node.text}
  {:else if node.type === 'fragment'}
    {@render renderList(node.children)}
  {:else}
    {@const pending = pendingByTag[node.tag]}
    {#if pending !== undefined}
      {@const Handler = pending.handler as Component<Record<string, unknown>>}
      <!--
        A handler that throws degrades to the translation's own children rather
        than taking the tree down with it — the same degradation the React
        binding gives every handler form (react/src/T.tsx catches the handler
        CALL synchronously and wraps every element it renders in its own
        TagBoundary). Both bindings contain a client render only: neither a
        <svelte:boundary> nor a React boundary runs during SSR. Both also stay
        failed once they have caught, until the surrounding tree remounts.
        Needs svelte >= 5.3 for <svelte:boundary>.
      -->
      <svelte:boundary
        onerror={(error) =>
          i18n.reportError(error as Error, { source: 'translation', tagName: pending.name })}
      >
        <Handler {...(pending.props ?? {})}>
          {@render renderList(node.children)}
        </Handler>
        {#snippet failed()}
          {@render renderList(node.children)}
        {/snippet}
      </svelte:boundary>
    {:else if node.children.length === 0}
      <svelte:element this={node.tag} {...elementProps(node.props)} />
    {:else}
      <svelte:element this={node.tag} {...elementProps(node.props)}
        >{@render renderList(node.children)}</svelte:element
      >
    {/if}
  {/if}
{/snippet}

{#if renderSlot}
  {@render children?.()}
{:else if typeof prepared.content === 'string'}
  {prepared.content}
{:else}
  {@render renderList(prepared.content)}
{/if}
