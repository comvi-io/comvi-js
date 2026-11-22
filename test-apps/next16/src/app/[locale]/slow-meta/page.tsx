import http from "node:http";
import type { Metadata } from "next";
import { getAlternates } from "@comvi/next/routing";
import { routing } from "@/i18n/routing";

// Dynamic, and its metadata resolves only after the page shell: generateMetadata waits on a
// request to the catalog mock (pair `<locale>:seo`) that the e2e holds and then releases.
export const dynamic = "force-dynamic";

const gate = (locale: string) =>
  new Promise<void>((resolve, reject) => {
    http
      .get(`${process.env.COMVI_E2E_CATALOGS}/seo/${locale}.json`, (res) =>
        res.resume().on("end", () => resolve()),
      )
      .on("error", reject);
  });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  await gate(locale);
  return { alternates: getAlternates(routing, { locale, href: "/slow-meta" }) };
}

export default function SlowMetaPage() {
  return <p data-testid="slow-meta">slow metadata</p>;
}
