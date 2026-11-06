// What typegen v2 emits for this project (augmenting @comvi/svelte, which re-exports Catalogs).
import type { Tag } from "@comvi/svelte";
declare module "@comvi/svelte" {
  interface Catalogs {
    default: {
      greeting: { name: string };
      title: never;
      items: { count: number };
      terms: { link: Tag };
    };
    shop: { "cart.title": { count: number } };
  }
}
