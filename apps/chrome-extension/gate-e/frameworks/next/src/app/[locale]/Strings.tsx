"use client";

import { useEffect, useState } from "react";
import { T, useI18n } from "@comvi/react";
import { Link } from "@comvi/next/navigation";

/** Sets body[data-booted] once the client tree has hydrated (site.ts waits for it). */
export function Booted() {
  useEffect(() => {
    document.body.dataset.booted = "true";
  }, []);
  return null;
}

export function Home() {
  const { t } = useI18n();
  const [late, setLate] = useState(false);
  return (
    <section id="region-A">
      <h1 id="A-title">{t("home.title")}</h1>
      <p id="A-common">{t("save", { ns: "common" })}</p>
      <p id="A-missing">{t("missing.key")}</p>
      <p id="A-rich">
        <T i18nKey="rich.terms" b={(chunks) => <b>{chunks}</b>} />
      </p>
      <button id="more" type="button" onClick={() => setLate(true)}>
        More
      </button>
      {late && <p id="A-late">{t("nav.about")}</p>}
      <Link id="to-about" href="/about">
        {t("nav.about")}
      </Link>
    </section>
  );
}

export function About() {
  const { t } = useI18n();
  return (
    <section id="region-B">
      <h1 id="B-title">{t("home.title")}</h1>
      <p id="B-rich">
        <T i18nKey="rich.terms" b={(chunks) => <b>{chunks}</b>} />
      </p>
    </section>
  );
}
