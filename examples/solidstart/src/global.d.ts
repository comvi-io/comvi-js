/// <reference types="@solidjs/start/env" />

declare namespace App {
  interface RequestEventLocals {
    /** This request's instance (`src/lib/i18n.ts`). */
    i18n?: import("@comvi/solid").I18n;
  }
}
