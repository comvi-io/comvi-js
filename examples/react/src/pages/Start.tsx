import { Link, useOutletContext } from "react-router";
import { useI18n } from "@comvi/react";
import type { Shared } from "../App";

export function Start() {
  const { name } = useOutletContext<Shared>();
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
