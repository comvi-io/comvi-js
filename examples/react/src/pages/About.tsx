import { Suspense } from "react";
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
        <Suspense fallback={<p className="body">{t("app.loading")}</p>}>
          <AccountDetails name={name} />
        </Suspense>
        <p>
          <Link data-testid="nav-home" to="/features">
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
