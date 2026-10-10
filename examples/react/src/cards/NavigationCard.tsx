import { Link } from "react-router";
import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

export function NavigationCard() {
  const { t } = useI18n();

  return (
    <FeatureCard feature="navigation">
      <p className="widget">
        <Link data-testid="nav-about" to="/about">
          {t("demo.navigation.cta")}
        </Link>
      </p>
    </FeatureCard>
  );
}
