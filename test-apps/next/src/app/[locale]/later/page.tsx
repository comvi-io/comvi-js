import { cookies } from "next/headers";
import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@comvi/next/server";
import { WithLoader } from "@/i18n/client";
import { LaterCard } from "./LaterCard";

// Dynamic: what the page loads depends on a cookie, so `router.refresh()` can bring a
// namespace the first payload of this provider did not carry.
export const dynamic = "force-dynamic";

export default async function LaterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const more = (await cookies()).get("e2e-more")?.value === "1";
  const { i18n } = await getI18n({ locale, ns: more ? ["default", "admin"] : "default" });
  return (
    <I18nProvider i18n={i18n} client={WithLoader}>
      <LaterCard more={more} />
    </I18nProvider>
  );
}
