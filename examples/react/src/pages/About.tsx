import { Link, useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { useI18n } from "@comvi/react";
import type { Shared } from "../App";
import { AccountDetails } from "../components/AccountDetails";
import { FeatureCard } from "../components/FeatureCard";
import { LoadError } from "../components/LoadError";
import { NamespacesLine } from "../components/NamespacesLine";

export function About() {
  const { name } = useOutletContext<Shared>();
  const { t } = useI18n();
  // The route's loader result; running the loader again retries the `account` namespace.
  const { accountFailed } = useLoaderData<{ accountFailed: boolean }>();
  const { revalidate } = useRevalidator();

  return (
    <div className="cards">
      <article className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        {accountFailed ? (
          <LoadError onRetry={() => void revalidate()} />
        ) : (
          <AccountDetails name={name} />
        )}
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
