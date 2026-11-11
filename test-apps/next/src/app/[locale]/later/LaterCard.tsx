"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@comvi/react";

function AdminWidget() {
  const { t, isLoading } = useI18n("admin");
  return (
    <p data-testid="later-admin" data-loading={String(isLoading)}>
      {t("welcome_admin")}
    </p>
  );
}

export function LaterCard({ more }: { more: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [count, setCount] = useState(0);
  return (
    <div>
      <p data-testid="later-title">{t("home.title")}</p>
      <button data-testid="later-count" onClick={() => setCount(count + 1)}>
        {count}
      </button>
      <button
        data-testid="later-more"
        onClick={() => {
          document.cookie = "e2e-more=1; path=/";
          router.refresh();
        }}
      >
        more
      </button>
      {more && <AdminWidget />}
    </div>
  );
}
