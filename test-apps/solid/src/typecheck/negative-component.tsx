/**
 * Negative types of the BUILT @comvi/solid `<T>` (`dist/*.d.ts`, through the workspace link)
 * against the catalogs `comvi typegen` generates from ../locales. Never imported by the app:
 * checked by `pnpm typecheck`, where every `@ts-expect-error` must fire.
 */
import { T, useI18n } from "@comvi/solid";

export function NegativeT() {
  const AccountT = useI18n("account").T;
  return (
    <>
      {/* Controls: each compiles. */}
      <T i18nKey="home.title" />
      <T i18nKey="home.intro" name="Ann" />
      <T i18nKey="rich_text.link_text" link={(c) => <a href="/x">{c}</a>} />
      <T i18nKey="rich_text.link_text" components={{ link: "a" }} />
      <T i18nKey="profile.heading" ns="account" name="Ann" />
      <AccountT i18nKey="profile.heading" name="Ann" />
      {/* `components` is not keyed by the message's tags (one map may serve many messages): */}
      {/* with it every tag param is optional and an entry may name a tag the message lacks. */}
      <T i18nKey="rich_text.link_text" components={{}} />
      <T i18nKey="rich_text.link_text" components={{ link: "a", lnk: "a" }} />

      {/* @ts-expect-error a key the catalog lacks */}
      <T i18nKey="home.titel" />
      {/* @ts-expect-error a key of another namespace */}
      <T i18nKey="profile.heading" name="Ann" />
      {/* @ts-expect-error a namespace that does not exist */}
      <T i18nKey="home.title" ns="acount" />
      {/* @ts-expect-error a default-namespace key on the account <T> */}
      <AccountT i18nKey="home.title" />
      {/* @ts-expect-error a missing param */}
      <T i18nKey="home.intro" />
      {/* @ts-expect-error a missing param on the account <T> */}
      <AccountT i18nKey="profile.heading" />
      {/* @ts-expect-error a count is a number */}
      <T i18nKey="plurals.items" count="2" />
      {/* @ts-expect-error a missing param beside the components of a rich key */}
      <T i18nKey="rich_text.nested_mixed" components={{ alert: "p", bold: "b", link: "a" }} />
      {/* @ts-expect-error a missing tag handler, no components */}
      <T i18nKey="rich_text.link_text" />
      {/* @ts-expect-error a misspelt tag handler */}
      <T i18nKey="rich_text.link_text" lnk={() => "x"} />
      {/* @ts-expect-error a tag handler that is no function */}
      <T i18nKey="rich_text.link_text" link="a" />
      {/* @ts-expect-error an unknown tag handler beside the right one */}
      <T i18nKey="rich_text.link_text" link={() => "x"} lnk={() => "x"} />
      {/* @ts-expect-error a components entry that is no component */}
      <T i18nKey="rich_text.link_text" components={{ link: 1 }} />
    </>
  );
}
