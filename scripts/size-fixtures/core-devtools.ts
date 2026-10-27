// @comvi/core/devtools alone (ceiling 1,300, COM-140 ≈ 1,200): discovery + the editor
// loader, the bytes `plugins: [devtools()]` adds to an app.
import { devtools } from "@comvi/core/devtools";

export const out = devtools();
