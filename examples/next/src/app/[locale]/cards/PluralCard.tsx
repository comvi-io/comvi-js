"use client";

import { useI18n } from "@comvi/next/client";
import { Card } from "./Card";

export function PluralCard({ count, change }: { count: number; change: (delta: number) => void }) {
  const { t } = useI18n();
  return (
    <Card title={t("demo.plural.title")} body={t("demo.plural.body")}>
      <div className="widget counter">
        <button className="square" data-testid="cart-dec" onClick={() => change(-1)}>
          −
        </button>
        <span data-testid="cart">{t("cart.items", { count })}</span>
        <button className="square" data-testid="cart-inc" onClick={() => change(1)}>
          +
        </button>
      </div>
    </Card>
  );
}
