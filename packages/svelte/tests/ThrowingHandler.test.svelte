<script lang="ts">
  // Throws while rendering, the way a tag handler with a bad prop access or a
  // failing child component does. No `$props()` read: touching a prop here
  // would emit `state_referenced_locally` on every run and the throw is the
  // whole point of the component.
  throw new Error("handler exploded");
</script>
