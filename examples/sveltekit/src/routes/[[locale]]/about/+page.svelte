<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  import { localePath } from "../../../lib/i18n";

  const r = useI18n();
  const t = r.t;
</script>

<p data-testid="about">{t("about.body")}</p>
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localePath() builds the path -->
<p><a data-testid="nav-home" href={localePath(r.locale)}>{t("nav.home")}</a></p>
