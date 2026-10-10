"use client";

import { useEffect } from "react";
import { ErrorsCard } from "./cards/ErrorsCard";
import { FallbackCard } from "./cards/FallbackCard";
import { FormattingCard } from "./cards/FormattingCard";
import { GreetingCard } from "./cards/GreetingCard";
import { LazyCard } from "./cards/LazyCard";
import { MissingParamCard } from "./cards/MissingParamCard";
import { NavigationCard } from "./cards/NavigationCard";
import { OrdinalCard } from "./cards/OrdinalCard";
import { PluralCard } from "./cards/PluralCard";
import { SelectCard } from "./cards/SelectCard";
import { TagsCard } from "./cards/TagsCard";
import { useCount } from "./cards/useCount";

export function FeatureCards() {
  // One counter drives both the plural and the ordinal card.
  const [count, change] = useCount();

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
      <TagsCard />
      <FormattingCard />
      <LazyCard />
      <FallbackCard />
      <ErrorsCard />
      <MissingParamCard />
      <NavigationCard />
    </>
  );
}
