"use client";

import { useEffect, useState } from "react";
import { ErrorsCard } from "./cards/ErrorsCard";
import { FallbackCard } from "./cards/FallbackCard";
import { FormalityCard } from "./cards/FormalityCard";
import { FormattingCard } from "./cards/FormattingCard";
import { GreetingCard } from "./cards/GreetingCard";
import { LazyCard } from "./cards/LazyCard";
import { MissingParamCard } from "./cards/MissingParamCard";
import { NavigationCard } from "./cards/NavigationCard";
import { OptionsCard } from "./cards/OptionsCard";
import { OrdinalCard } from "./cards/OrdinalCard";
import { PluralCard } from "./cards/PluralCard";
import { SelectCard } from "./cards/SelectCard";
import { TagsCard } from "./cards/TagsCard";

export function FeatureCards() {
  // One counter drives both the plural and the ordinal card.
  const [count, setCount] = useState(2);
  const change = (delta: number) => setCount((current) => Math.max(0, current + delta));

  // Marks the document once React has hydrated it.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <>
      <GreetingCard />
      <PluralCard count={count} change={change} />
      <OrdinalCard count={count} />
      <SelectCard />
      <FormalityCard />
      <TagsCard />
      <FormattingCard />
      <OptionsCard />
      <FallbackCard />
      <MissingParamCard />
      <ErrorsCard />
      <NavigationCard />
      <LazyCard />
    </>
  );
}
