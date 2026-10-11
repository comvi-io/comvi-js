import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "@comvi/react";
import { CallOptionsCard } from "../cards/CallOptionsCard";
import { ErrorsCard } from "../cards/ErrorsCard";
import { FallbackCard } from "../cards/FallbackCard";
import { FormalityCard } from "../cards/FormalityCard";
import { FormattingCard } from "../cards/FormattingCard";
import { GreetingCard } from "../cards/GreetingCard";
import { LazyLoadingCard } from "../cards/LazyLoadingCard";
import { MarkupCard } from "../cards/MarkupCard";
import { MissingParamCard } from "../cards/MissingParamCard";
import { NavigationCard } from "../cards/NavigationCard";
import { OrdinalCard } from "../cards/OrdinalCard";
import { PluralCard } from "../cards/PluralCard";
import { SelectCard } from "../cards/SelectCard";

type Props = { name: string; onNameChange: (name: string) => void };

export function Features({ name, onNameChange }: Props) {
  const { t } = useI18n();
  // The plural and ordinal cards read the same number.
  const [count, setCount] = useState(2);

  return (
    <div className="cards">
      <p className="note">
        <Link to="/">{t("demo.start.back")}</Link>
      </p>
      <GreetingCard name={name} onChange={onNameChange} />
      <PluralCard count={count} onChange={setCount} />
      <OrdinalCard count={count} />
      <SelectCard />
      <FormalityCard />
      <MarkupCard />
      <FormattingCard />
      <CallOptionsCard />
      <FallbackCard />
      <MissingParamCard />
      <ErrorsCard />
      <NavigationCard />
      <LazyLoadingCard />
    </div>
  );
}
