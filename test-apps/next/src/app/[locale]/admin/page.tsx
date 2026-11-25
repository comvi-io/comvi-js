import type { Metadata } from "next";
import { getAlternates } from "@comvi/next/routing";
import { getI18n } from "@/i18n/server";
import { routing } from "@/i18n/routing";
import { I18nProvider } from "@comvi/next/server";
import { WithLoader } from "@/i18n/client";
import { AdminCard } from "./AdminCard";

// Dynamic: rendered per request, so the e2e controls each request's catalog loads.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: getAlternates(routing, { locale, href: "/admin" }) };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // More namespaces than the layout: this page hands its own payload to its subtree.
  const { t, i18n } = await getI18n({ locale, ns: "admin" });
  return (
    <section>
      <h1 data-testid="admin-server">{t("dashboard")}</h1>
      <I18nProvider i18n={i18n} client={WithLoader}>
        <AdminCard />
      </I18nProvider>
    </section>
  );
}
