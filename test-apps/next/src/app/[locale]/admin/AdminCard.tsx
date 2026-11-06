"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@comvi/react";

export function AdminCard() {
  const { t, isReady, isLoading, i18n } = useI18n("admin");
  const router = useRouter();
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
    </div>
  );
}
