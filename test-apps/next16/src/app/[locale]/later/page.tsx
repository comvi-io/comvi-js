import { cookies } from "next/headers";
import { handover } from "@comvi/core/ssr";
import { getI18n } from "@/i18n/server";
import { Provider } from "@/i18n/client";
import { LaterCard } from "./LaterCard";

// Dynamic: what the page loads depends on a cookie, so `router.refresh()` can bring a
// namespace the first payload of this provider did not carry.
export const dynamic = "force-dynamic";

export default async function LaterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const more = (await cookies()).get("e2e-more")?.value === "1";
  const { i18n } = await getI18n({ locale, ns: more ? ["default", "admin"] : "default" });
  return (
    <Provider payload={handover(i18n)}>
      <LaterCard more={more} />
    </Provider>
  );
}
