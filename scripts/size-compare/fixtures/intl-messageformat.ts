import { IntlMessageFormat } from "intl-messageformat";
console.log(
  new IntlMessageFormat("{count, plural, one {# item} other {# items}}", "en").format({ count: 2 }),
);
