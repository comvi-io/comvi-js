import { getI18n } from "../../i18n/server";
import { Home } from "./Strings";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });
  return (
    <>
      <p id="S-title">{t("home.title")}</p>
      <Home />
    </>
  );
}
