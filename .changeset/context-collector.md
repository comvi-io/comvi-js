---
"@comvi/plugin-in-context-editor": minor
---

Passive UI-context collector for active in-context-editor sessions:

- Observes visible translation targets (IntersectionObserver-driven, event-triggered, no polling) and sends structural/semantic/constraint signals plus neighbor key refs to the platform's context API — never rendered text.
- Screens are grouped by an opaque digest of the normalized route by default; the new `screenGroupResolver` option lets integrations supply a readable, PII-free route template (e.g. `/users/:id`) instead. Modal id/testid/labelledby discriminators are digested, not sent verbatim.
- Targets inside an open dialog get a modal-suffixed screen group; background keys keep the route group.
- Mutation-class triggers (DOM/attribute/text/translation/route/resize) re-evaluate signals even when the visible key set is unchanged, so same-key drift converges; the transport's per-item hash gate keeps unchanged re-evaluations off the network, and failed batches retry instead of being dropped.
- `collectContext: false` opts out entirely and is honored from both the plugin factory and standalone activation.
