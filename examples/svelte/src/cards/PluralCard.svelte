<script lang="ts">
  import { useI18n } from '@comvi/svelte';
  import Card from '../components/Card.svelte';

  let { count = $bindable() }: { count: number } = $props();
  const { t } = useI18n();
</script>

<Card title={$t('demo.plural.title')} body={$t('demo.plural.body')}>
  <div class="widget counter">
    <button data-testid="cart-dec" onclick={() => (count = Math.max(0, count - 1))}>−</button>
    <span data-testid="cart">{$t('cart.items', { count })}</span>
    <button data-testid="cart-inc" onclick={() => count++}>+</button>
  </div>
</Card>
