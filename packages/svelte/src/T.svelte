<script lang="ts">
  import { getI18nContext } from './context';
  import { createLocaleStore, createCacheRevisionStore } from './stores';
  import { createElement as createVirtualElement } from '@comvi/core';
  import type { TranslationParams, VirtualNode, TranslationResult, TagCallbackParams } from '@comvi/core';
  import type { ComponentMap, ComponentMapping, TProps } from './types';

  // Sentinel value: distinguishes "prop not passed" from "prop passed as undefined".
  // $$props is unavailable in runes mode; we use this symbol as the default so that
  // `value !== UNSET` means the caller explicitly provided the prop.
  const UNSET = Symbol('unset');

  const DEFAULT_ALLOWED_TAGS = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data',
    'del', 'dfn', 'em', 'hr', 'i', 'img', 'ins', 'kbd', 'mark',
    'ol', 'li', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
    'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'ul',
    'var', 'wbr',
  ]);

  let {
    i18nKey,
    params = {},
    ns = UNSET as unknown as string | undefined,
    locale = UNSET as unknown as string | undefined,
    fallback = UNSET as unknown as string | undefined,
    raw = UNSET as unknown as boolean,
    components = {} as ComponentMap,
    allowedTags = undefined as Set<string> | undefined,
    children = undefined as TProps['children'],
  }: TProps = $props();

  const i18n = getI18nContext();
  const languageStore = createLocaleStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);

  // Helper to convert children to array format for VirtualNode
  function childrenToArray(ch: TranslationResult): (string | VirtualNode)[] {
    if (typeof ch === 'string') {
      return ch ? [ch] : [];
    }
    return ch;
  }

  function normalizeComponentMapping(mapping: ComponentMapping): {
    tag: string;
    props?: Record<string, string | boolean>;
  } {
    if (typeof mapping === 'string') {
      return { tag: mapping };
    }
    return mapping;
  }

  // Returns true when the caller explicitly passed this prop (including as undefined).
  // Uses the UNSET sentinel because $$props is not available in runes mode.
  function hasExplicitProp(value: unknown): boolean {
    return value !== UNSET;
  }

  // Build tag handlers from components prop
  function buildTagHandlers(comps: ComponentMap): Record<string, (p: TagCallbackParams) => VirtualNode> {
    const handlers: Record<string, (p: TagCallbackParams) => VirtualNode> = {};
    for (const [tagName, mapping] of Object.entries(comps)) {
      const normalizedMapping = normalizeComponentMapping(mapping);
      handlers[tagName] = ({ children: ch }: TagCallbackParams) => {
        return createVirtualElement(
          normalizedMapping.tag,
          normalizedMapping.props || {},
          childrenToArray(ch),
        );
      };
    }
    return handlers;
  }

  function buildTransportParams(): TranslationParams {
    const transportParams: TranslationParams = {
      ...params,
      ...buildTagHandlers(components),
    };

    if (hasExplicitProp(ns)) {
      transportParams.ns = ns as string | undefined;
    }
    if (hasExplicitProp(locale)) {
      transportParams.locale = locale as string | undefined;
    }
    if (hasExplicitProp(fallback)) {
      transportParams.fallback = fallback as string | undefined;
    }
    if (hasExplicitProp(raw)) {
      transportParams.raw = raw as boolean;
    }

    return transportParams;
  }

  // Reactive translation — reacts to all props and both stores.
  const translationExists = $derived.by(() => {
    void $languageStore;
    void $cacheRevision;

    const targetLanguage = hasExplicitProp(locale) ? (locale as string | undefined) : params.locale;
    const targetNamespace = hasExplicitProp(ns) ? (ns as string | undefined) : params.ns;

    return i18n.hasTranslation(i18nKey as string, targetLanguage, targetNamespace, true);
  });

  const result = $derived.by(() => {
    // Access stores to establish reactive dependency
    void $languageStore;
    void $cacheRevision;

    return i18n.tRaw(i18nKey as string, buildTransportParams());
  });

  // Validate attribute name: block event handlers and dangerous attributes
  function isSafeAttrName(name: string): boolean {
    const lower = name.toLowerCase();
    return !lower.startsWith('on') && lower !== 'srcdoc' && lower !== 'formaction';
  }

  // Helper to build attributes string.
  // Safe defaults injected here for {@html} context:
  //   - <a target="_blank"> without rel gets rel="noopener noreferrer" to prevent
  //     tab-napping attacks.
  //   - <img> without alt gets alt="" so screen readers skip decorative images.
  function buildAttrs(tag: string, props: Record<string, string | boolean | unknown>): string {
    const merged: Record<string, string | boolean | unknown> = { ...props };

    if (tag === 'a' && merged['target'] === '_blank' && !('rel' in merged)) {
      merged['rel'] = 'noopener noreferrer';
    }
    if (tag === 'img' && !('alt' in merged)) {
      merged['alt'] = '';
    }

    return Object.entries(merged)
      .filter(([key]) => isSafeAttrName(key))
      .map(([key, value]) => {
        if (typeof value === 'boolean') {
          return value ? key : '';
        }
        return `${key}="${escapeAttr(String(value))}"`;
      })
      .filter(Boolean)
      .join(' ');
  }

  // Helper to convert VirtualNode to HTML string
  function virtualNodeToHtml(node: VirtualNode): string {
    if (node.type === 'text') {
      return escapeHtml(node.text);
    }

    if (node.type === 'fragment') {
      return renderToHtml(node.children as TranslationResult);
    }

    // Element node — tagHandlers already resolved the correct tag/props
    const tag = node.tag;
    const props = node.props || {};
    const nodeChildren = node.children as TranslationResult;

    // Validate tag against allowed list to prevent XSS
    const safeTags = allowedTags ?? DEFAULT_ALLOWED_TAGS;
    if (!safeTags.has(tag)) {
      return `<span>${renderToHtml(nodeChildren)}</span>`;
    }

    // Build attributes string (with a11y safe defaults injected)
    const attrs = buildAttrs(tag, props);

    // Self-closing tags
    const selfClosing = ['br', 'hr', 'img', 'input', 'meta'].includes(tag);
    if (selfClosing) {
      return attrs ? `<${tag} ${attrs} />` : `<${tag} />`;
    }

    const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;

    return `${openTag}${renderToHtml(nodeChildren)}${closeTag}`;
  }

  // Convert TranslationResult to HTML string
  function renderToHtml(content: TranslationResult): string {
    if (typeof content === 'string') {
      return escapeHtml(content);
    }

    return content
      .map((item) => (typeof item === 'string' ? escapeHtml(item) : virtualNodeToHtml(item)))
      .join('');
  }

  // Escape HTML content.
  // NOTE: This function escapes only &, <, and > because it is used exclusively in
  // TEXT/element-content context. Attribute values use escapeAttr separately, which
  // additionally escapes quotes and apostrophes per OWASP recommendations.
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Escape attribute values per OWASP recommendations
  function escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Derived rendering decisions
  const isMissingTranslation = $derived(
    !translationExists &&
    (fallback === UNSET || fallback === undefined) &&
    typeof result === 'string' &&
    result === (i18nKey as string),
  );

  const renderSlot = $derived(isMissingTranslation && children != null);

  const htmlOutput = $derived(
    typeof result === 'string' ? escapeHtml(result) : renderToHtml(result),
  );
</script>

{#if renderSlot}
  {@render children?.()}
{:else}
  {@html htmlOutput}
{/if}
