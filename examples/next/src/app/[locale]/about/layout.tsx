import { ComviProvider } from "@comvi/next/server";

/**
 * The `account` namespace belongs to this route alone. The root layout's
 * provider ships the default namespace; this one loads `account` as well, for
 * the locale and its fallback chain, and hands both to the client components
 * below. A page outside this layout never receives the `account` catalog.
 */
export default async function AboutLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <ComviProvider locale={locale} namespaces={["default", "account"]}>
      {children}
    </ComviProvider>
  );
}
