<!--
  `<T>` of the BUILT @comvi/svelte takes a rich key (rich-key.ts: `t()` does not). Never
  mounted: checked by `pnpm typecheck` (svelte-check).
-->
<script lang="ts">
  import { T } from '@comvi/svelte';
</script>

<T i18nKey="rich_text.bold_text" components={{ strong: 'strong' }} />
<T i18nKey="rich_text.link_text">
  {#snippet link(children: string)}<a href="/terms">{children}</a>{/snippet}
</T>
