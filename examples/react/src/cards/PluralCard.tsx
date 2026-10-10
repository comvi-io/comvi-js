import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

type Props = { count: number; onChange: (count: number) => void };

export function PluralCard({ count, onChange }: Props) {
  const { t } = useI18n();

  return (
    <FeatureCard feature="plural">
      <div className="counter widget">
        <button
          data-testid="cart-dec"
          aria-label={t("demo.plural.dec")}
          onClick={() => onChange(Math.max(0, count - 1))}
        >
          −
        </button>
        <span data-testid="cart">{t("cart.items", { count })}</span>
        <button
          data-testid="cart-inc"
          aria-label={t("demo.plural.inc")}
          onClick={() => onChange(count + 1)}
        >
          +
        </button>
      </div>
    </FeatureCard>
  );
}
