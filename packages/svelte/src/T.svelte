<script lang="ts">
  // Importing from '@comvi/core/tags' also registers tag syntax AMBIENTLY for
  // any plain string-API `t()` use in the app (§1.2). <T> itself does NOT
  // depend on that: prepareTranslation passes the tag extension per call.
  import { prepareTranslation } from '@comvi/core/tags';
  import type { PendingHandler } from '@comvi/core/tags';
  import type { Component } from 'svelte';
  import type { VirtualNode } from '@comvi/core';
  import { getI18nContext } from './context';
  import { createLocaleStore, createCacheRevisionStore } from './stores';
  import type { TProps } from './types';

  let {
    i18nKey,
    params = {},
    ns = undefined,
    locale = undefined,
    fallback = undefined,
    raw = undefined,
    components = undefined,
    children = undefined,
  }: TProps = $props();

  const i18n = getI18nContext();
  const languageStore = createLocaleStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);

  // Shared <T> pipeline — reacts to all props and both stores.
  const prepared = $derived.by(() => {
    // Access stores to establish reactive dependency
    void $languageStore;
    void $cacheRevision;

    return prepareTranslation(i18n, {
      i18nKey: i18nKey as string,
      params,
      ns,
      locale,
      fallback,
      raw,
      components,
    });
  });

  // Marker tag → pending framework handler, for the structural converter below.
  const pendingByTag = $derived.by(() => {
    const byTag: Record<string, PendingHandler> = Object.create(null);
    for (const pending of prepared.pendingHandlers) {
      byTag[pending.marker] = pending;
    }
    return byTag;
  });

  const renderSlot = $derived(prepared.isMissing && children != null);

  // Attribute contract parity with the other wrappers (and the pre-rewrite
  // string renderer): a boolean `false` prop means "omit the attribute".
  // `<svelte:element>` spreads would otherwise serialize it as `attr="false"`.
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
  Recursive structural render of the VirtualNode tree. Translation content can
  only ever produce text nodes and handler-mapped elements — there is no HTML
  string sink, so untrusted translations cannot inject markup.
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
      <Handler {...(pending.props ?? {})}>
        {@render renderList(node.children)}
      </Handler>
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
