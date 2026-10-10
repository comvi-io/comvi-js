import { Link } from "react-router";
import { useI18n } from "@comvi/react";
import { Account } from "./Account";
import { Card } from "./Card";

export function About({ name }: { name: string }) {
  const { t, getActiveNamespaces } = useI18n();

  return (
    <div className="cards">
      <article className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        {/* A second namespace, fetched when this route is first shown */}
        <Account name={name} />
        <p>
          <Link data-testid="nav-home" to="/">
            {t("nav.home")}
          </Link>
        </p>
      </article>

      {/* What this route just loaded: `account` joins the active namespaces. */}
      <Card feature="lazy">
        <div className="net">
          <code>{t("demo.lazy.namespaces", { namespaces: getActiveNamespaces().join(", ") })}</code>
        </div>
      </Card>
    </div>
  );
}
