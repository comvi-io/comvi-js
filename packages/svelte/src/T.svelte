<script lang="ts">
  import { getI18nContext } from './context';
  import { createLanguageStore, createCacheRevisionStore } from './stores';
  import { createElement as createVirtualElement } from '@comvi/core';
  import type { TranslationParams, VirtualNode, TranslationResult, TagCallbackParams, TranslationKeys, PermissiveKey } from '@comvi/core';
  import type { ComponentMap, ComponentMapping } from './types';

  const DEFAULT_ALLOWED_TAGS = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data',
    'del', 'dfn', 'em', 'hr', 'i', 'img', 'ins', 'kbd', 'mark',
    'ol', 'li', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
    'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'ul',
    'var', 'wbr',
  ]);

  // Props
  export let i18nKey: keyof TranslationKeys | PermissiveKey;
  export let params: TranslationParams = {};
  export let ns: string | undefined = undefined;
  export let locale: string | undefined = undefined;
  export let fallback: string | undefined = undefined;
  export let raw: boolean = false;
  /**
   * Component mapping for tag interpolation in T component.
   * Note: In Svelte, `<T>` constructs an HTML string and injects it via `{@html}`.
   * Therefore, this map only supports standard HTML tags (e.g. `a`, `strong`),
   * not Svelte Components.
   */
  export let components: ComponentMap = {};
  /**
   * Set of allowed HTML tag names for rendering via {@html}.
   * Tags not in this set are rendered as `<span>` to prevent XSS.
   * Defaults to a safe set of inline/block formatting tags.
   */
  export let allowedTags: Set<string> | undefined = undefined;

  const i18n = getI18nContext();
  const languageStore = createLanguageStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);

  // Helper to convert children to array format for VirtualNode
  function childrenToArray(children: TranslationResult): (string | VirtualNode)[] {
    if (typeof children === 'string') {
      return children ? [children] : [];
    }
    return children;
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

  function hasExplicitProp(propName: string): boolean {
    return Object.prototype.hasOwnProperty.call($$props, propName);
  }

  // Build tag handlers from components prop
  function buildTagHandlers(comps: ComponentMap): Record<string, (p: TagCallbackParams) => VirtualNode> {
    const handlers: Record<string, (p: TagCallbackParams) => VirtualNode> = {};
    for (const [tagName, mapping] of Object.entries(comps)) {
      const normalizedMapping = normalizeComponentMapping(mapping);
      handlers[tagName] = ({ children }: TagCallbackParams) => {
        return createVirtualElement(
          normalizedMapping.tag,
          normalizedMapping.props || {},
          childrenToArray(children),
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

    if (hasExplicitProp('ns')) {
      transportParams.ns = ns;
    }
    if (hasExplicitProp('locale')) {
      transportParams.locale = locale;
    }
    if (hasExplicitProp('fallback')) {
      transportParams.fallback = fallback;
    }
    if (hasExplicitProp('raw')) {
      transportParams.raw = raw;
    }

    return transportParams;
  }

  // Reactive translation - explicit dependencies for clarity
  // Reacts to: props (i18nKey, params, ns, locale, fallback, raw, components)
  //            stores ($languageStore, $cacheRevision)

  $: translationExists = (() => {
    void $languageStore;
    void $cacheRevision;

    const targetLanguage = hasExplicitProp('locale') ? locale : params.locale;
    const targetNamespace = hasExplicitProp('ns') ? ns : params.ns;

    return i18n.hasTranslation(i18nKey as string, targetLanguage, targetNamespace, true);
  })();

  $: result = (() => {
    // Access stores to establish reactive dependency
    void $languageStore;
    void $cacheRevision;

    return i18n.tRaw(i18nKey as string, buildTransportParams());
  })();

  // Validate attribute name: block event handlers and dangerous attributes
  function isSafeAttrName(name: string): boolean {
    const lower = name.toLowerCase();
    return !lower.startsWith('on') && lower !== 'srcdoc' && lower !== 'formaction';
  }

  // Helper to build attributes string
  function buildAttrs(props: Record<string, string | boolean | unknown>): string {
    return Object.entries(props)
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

    // Element node - tagHandlers already resolved the correct tag/props
    const tag = node.tag;
    const props = node.props || {};
    const children = node.children as TranslationResult;

    // Validate tag against allowed list to prevent XSS
    const safeTags = allowedTags ?? DEFAULT_ALLOWED_TAGS;
    if (!safeTags.has(tag)) {
      return `<span>${renderToHtml(children)}</span>`;
    }

    // Build attributes string
    const attrs = buildAttrs(props);

    // Self-closing tags
    const selfClosing = ['br', 'hr', 'img', 'input', 'meta'].includes(tag);
    if (selfClosing) {
      return attrs ? `<${tag} ${attrs} />` : `<${tag} />`;
    }

    const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;

    return `${openTag}${renderToHtml(children)}${closeTag}`;
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

  // Escape HTML content
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

  // Final HTML output
  $: isMissingTranslation =
    !translationExists &&
    fallback === undefined &&
    typeof result === 'string' &&
    result === (i18nKey as string);

  $: renderSlot = isMissingTranslation && $$slots.default;

  $: htmlOutput = typeof result === 'string' ? escapeHtml(result) : renderToHtml(result);
</script>

{#if renderSlot}
  <slot />
{:else}
  {@html htmlOutput}
{/if}
