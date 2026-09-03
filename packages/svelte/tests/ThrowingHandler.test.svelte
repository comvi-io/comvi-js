<script lang="ts">
  // Throws while rendering, the way a tag handler with a bad prop access or a
  // failing child component does. The children prop is declared so the shape
  // matches a real handler.
  let { children = undefined }: { children?: unknown } = $props();
  void children;
  throw new Error("handler exploded");
</script>
