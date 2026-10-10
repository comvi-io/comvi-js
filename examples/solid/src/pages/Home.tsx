import { createSignal } from "solid-js";
import { GreetingCard } from "../cards/GreetingCard";
import { PluralCard } from "../cards/PluralCard";
import { OrdinalCard } from "../cards/OrdinalCard";
import { SelectCard } from "../cards/SelectCard";
import { TagsCard } from "../cards/TagsCard";
import { FormattingCard } from "../cards/FormattingCard";
import { LazyCard } from "../cards/LazyCard";
import { CallOptionsCard } from "../cards/CallOptionsCard";
import { FallbackCard } from "../cards/FallbackCard";
import { MissingParamCard } from "../cards/MissingParamCard";
import { ErrorsCard } from "../cards/ErrorsCard";
import { NavigationCard } from "../cards/NavigationCard";

export function Home() {
  // Shared by the plural and the ordinal card.
  const [count, setCount] = createSignal(2);

  return (
    <div class="cards">
      <GreetingCard />
      <PluralCard count={count()} onChange={setCount} />
      <OrdinalCard count={count()} />
      <SelectCard />
      <TagsCard />
      <FormattingCard />
      <LazyCard />
      <CallOptionsCard />
      <FallbackCard />
      <MissingParamCard />
      <ErrorsCard />
      <NavigationCard />
    </div>
  );
}
