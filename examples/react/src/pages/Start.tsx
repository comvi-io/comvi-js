import { Link } from "react-router";
import { useI18n } from "@comvi/react";

export function Start({ name }: { name: string }) {
  const { t } = useI18n();

  return (
    <div className="start">
      <p className="widget" data-testid="greeting">
        {t("greeting.hello", { name })}
      </p>
      <p>
        <Link className="cta" to="/features">
          {t("demo.start.cta")}
        </Link>
      </p>
    </div>
  );
}
