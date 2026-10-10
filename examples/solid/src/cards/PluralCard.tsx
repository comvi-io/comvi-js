import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

export function PluralCard(props: { count: number; onChange: (count: number) => void }) {
  const { t } = useI18n();
  return (
    <Card title={t("demo.plural.title")} body={t("demo.plural.body")}>
      <div class="widget counter">
        <button
          data-testid="cart-dec"
          aria-label={t("demo.plural.dec")}
          onClick={() => props.onChange(Math.max(0, props.count - 1))}
        >
          −
        </button>
        <span data-testid="cart">{t("cart.items", { count: props.count })}</span>
        <button
          data-testid="cart-inc"
          aria-label={t("demo.plural.inc")}
          onClick={() => props.onChange(props.count + 1)}
        >
          +
        </button>
      </div>
    </Card>
  );
}
