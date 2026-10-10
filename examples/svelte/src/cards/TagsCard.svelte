<script lang="ts">
  import { T, useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  const { t } = useI18n();

  // What `<link>` in the catalog becomes. The translator places the tag, the
  // app owns the element and its attributes.
  const components = {
    link: { tag: 'a', props: { href: 'https://comvi.io/docs', target: '_blank', rel: 'noreferrer' } },
  };
</script>

<Card title={$t('demo.tags.title')} body={$t('demo.tags.body')}>
  <p class="widget" data-testid="read-more"><T i18nKey="docs.read_more" {components} /></p>
</Card>
