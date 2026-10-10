import { Link } from "react-router";
import { useI18n } from "@comvi/react";
import { AccountDetails } from "../components/AccountDetails";
import { FeatureCard } from "../components/FeatureCard";
import { NamespacesLine } from "../components/NamespacesLine";

export function About({ name }: { name: string }) {
  const { t } = useI18n();

  return (
    <div className="cards">
      <article className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        <AccountDetails name={name} />
        <p>
          <Link data-testid="nav-home" to="/">
            {t("nav.home")}
          </Link>
        </p>
      </article>

      <FeatureCard feature="lazy">
        <div className="net">
          <NamespacesLine />
        </div>
      </FeatureCard>
    </div>
  );
}
