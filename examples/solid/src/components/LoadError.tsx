import { useI18n } from "@comvi/solid";

/** What a failed load shows: the problem, in the language on screen, and a way to ask again. */
export function LoadError(props: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <p class="note" role="alert" data-testid="load-error">
      {t("app.load_failed")}{" "}
      <button type="button" data-testid="load-retry" onClick={() => props.onRetry()}>
        {t("app.retry")}
      </button>
    </p>
  );
}
