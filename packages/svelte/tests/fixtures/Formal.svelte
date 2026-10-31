<script lang="ts">
  let { children, tone = "plain" }: Record<string, any> = $props();
</script>

<em class={tone} data-empty={children ? undefined : true}>{@render children?.()}</em>
