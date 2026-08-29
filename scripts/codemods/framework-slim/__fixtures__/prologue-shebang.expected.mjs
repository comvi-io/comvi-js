#!/usr/bin/env node
"use strict";
// A CLI that builds a host. The shebang and the directive prologue are POSITION
// SENSITIVE — an inserted import that landed above either one would break the
// file — so imports are placed relative to the last import, never to the top.
import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
import { plugins } from "@comvi/core/plugins";
import { Analytics } from "./analytics.mjs";

export const i18n = createI18n({ locale: "en" }).with(plugins()).use(Analytics()).with(devtools({ instanceId: "cli" }));
