import { T, useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

// What `<link>` in the catalog becomes. The translator places the tag, the app
// owns the element and its attributes.
const components = {
  link: {
    tag: "a",
    props: { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
  },
};

export function TagsCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.tags.title")} body={t("demo.tags.body")}>
      <p class="widget" data-testid="read-more">
        <T i18nKey="docs.read_more" components={components} />
      </p>
    </Card>
  );
}
