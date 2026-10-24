<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  import { localePath } from "../../../lib/i18n";

  const { t, locale } = useI18n();
</script>

<p data-testid="about">{$t("about.body")}</p>
<p><a data-testid="nav-home" href={localePath($locale)}>{$t("nav.home")}</a></p>
