declare global {
  namespace App {
    interface Locals {
      /** This request's instance (`hooks.server.ts`). */
      i18n: import("@comvi/core").I18n;
    }
  }
}

export {};
