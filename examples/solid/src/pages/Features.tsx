import { createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { GreetingCard } from "../cards/GreetingCard";
import { PluralCard } from "../cards/PluralCard";
import { OrdinalCard } from "../cards/OrdinalCard";
import { SelectCard } from "../cards/SelectCard";
import { FormalityCard } from "../cards/FormalityCard";
import { TagsCard } from "../cards/TagsCard";
import { FormattingCard } from "../cards/FormattingCard";
import { LazyCard } from "../cards/LazyCard";
import { CallOptionsCard } from "../cards/CallOptionsCard";
import { FallbackCard } from "../cards/FallbackCard";
import { MissingParamCard } from "../cards/MissingParamCard";
import { ErrorsCard } from "../cards/ErrorsCard";
import { NavigationCard } from "../cards/NavigationCard";

export function Features() {
  const { t } = useI18n();
  // Shared by the plural and the ordinal card.
  const [count, setCount] = createSignal(2);

  return (
    <>
      <p class="back">
        <A href="/" end>
          {t("demo.start.back")}
        </A>
      </p>
      <div class="cards">
        <GreetingCard />
        <PluralCard count={count()} onChange={setCount} />
        <OrdinalCard count={count()} />
        <SelectCard />
        <FormalityCard />
        <TagsCard />
        <FormattingCard />
        <CallOptionsCard />
        <FallbackCard />
        <MissingParamCard />
        <ErrorsCard />
        <NavigationCard />
        <LazyCard />
      </div>
    </>
  );
}
