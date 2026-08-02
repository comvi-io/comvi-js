<!-- Report-only — dropped VueI18n instance proxies; the receiver's type is
     textually undecidable, so these are listed for manual `i18n.core.*`. -->
<script setup lang="ts">
import { inject } from "vue";
import { I18N_INJECTION_KEY } from "@comvi/vue";

const i18n = inject(I18N_INJECTION_KEY)!;

function reload() {
  i18n.reloadTranslations();
  i18n.use(SomePlugin());
  i18n.core.registerPostProcessor((value) => value);
  i18n.core.use(SomePlugin());
}
</script>
