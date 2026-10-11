"use client";

import { useI18n } from "@comvi/next/client";
import { Link } from "@comvi/next/navigation";
import { Card } from "./Card";

export function NavigationCard() {
  const { t } = useI18n();
  return (
    <Card title={t("demo.navigation.title")} body={t("demo.navigation.body")}>
      <p className="widget">
        {/* <Link> adds the current locale to the path: `/about` goes to `/uk/about`. */}
        <Link data-testid="nav-about" href="/about">
          {t("demo.navigation.cta")}
        </Link>
      </p>
    </Card>
  );
}
