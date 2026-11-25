import { useI18n } from "@comvi/react";

/** What a failed load shows: the problem, in the language on screen, and a way to ask again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <p className="note" role="alert" data-testid="load-error">
      {t("app.load_failed")}{" "}
      <button type="button" data-testid="load-retry" onClick={onRetry}>
        {t("app.retry")}
      </button>
    </p>
  );
}
