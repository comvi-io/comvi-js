import { handover } from "@comvi/core/ssr";
import { getI18n } from "@/i18n/server";
import { Provider } from "@/i18n/client";
import { AdminCard } from "./AdminCard";

// Dynamic: rendered per request, so the e2e controls each request's catalog loads.
export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // More namespaces than the layout: this page hands its own payload to its subtree.
  const { t, i18n } = await getI18n({ locale, ns: "admin" });
  return (
    <section>
      <h1 data-testid="admin-server">{t("dashboard")}</h1>
      <Provider payload={handover(i18n)}>
        <AdminCard />
      </Provider>
    </section>
  );
}
