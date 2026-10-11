"use client";

import { useEffect } from "react";
import { useI18n } from "@comvi/next/client";
import { useName } from "./NameProvider";

export function StartGreeting() {
  const { t } = useI18n();
  const [name] = useName();

  // Marks the document once React has hydrated it.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <p className="widget" data-testid="greeting">
      {t("greeting.hello", { name })}
    </p>
  );
}
