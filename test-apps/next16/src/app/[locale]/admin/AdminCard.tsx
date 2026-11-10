"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@comvi/react";

export function AdminCard() {
  const { t, isReady, isLoading, i18n } = useI18n("admin");
  const router = useRouter();
  // Client state the e2e expects to survive a payload update (no remount).
  const [count, setCount] = useState(0);
  return (
    <div data-testid="admin-client" data-ready={String(isReady)} data-loading={String(isLoading)}>
      <p data-testid="admin-title">{t("welcome_admin")}</p>
      <p data-testid="admin-default">{t("home.title", { ns: "default" })}</p>
      <button data-testid="retry-load" onClick={() => void i18n.load("admin").catch(() => {})}>
        load
      </button>
      <button data-testid="retry-refresh" onClick={() => router.refresh()}>
        refresh
      </button>
      <button data-testid="admin-count" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </div>
  );
}
