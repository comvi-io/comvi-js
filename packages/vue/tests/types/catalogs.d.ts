// What typegen v2 emits for this project (augmenting @comvi/vue, which re-exports Catalogs).
import type { Tag } from "@comvi/vue";
declare module "@comvi/vue" {
  interface Catalogs {
    default: {
      greeting: { name: string };
      welcome: { firstName: string };
      title: never;
      items: { count: number };
      terms: { link: Tag };
    };
    shop: { "cart.title": { count: number } };
  }
}
