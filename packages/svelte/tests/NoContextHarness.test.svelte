<script lang="ts">
  // Deliberately never calls setI18nContext: mounting this must throw the
  // "context not found" guard rather than render a half-wired bag.
  import { useI18n } from "../src/useI18n";

  useI18n();
</script>

<div data-testid="never-rendered"></div>
