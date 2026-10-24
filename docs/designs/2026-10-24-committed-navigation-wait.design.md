# Reuse committed navigation evidence

Flow: bugfix; risk L2; retrospective pending. Parent: resume timely authorized publication while preserving exact identity, draft, intent, window and public verification.

Observed source boundary: a navigation already committed to the exact evidenced URL still performs an expensive host waitForURL. The existing separate content readiness and root fresh route/account observations remain authoritative. Navigation call receipts from the consumer show large host overhead; no platform refusal is inferred.

Chosen path: only for compose navigation, after the existing single click or goto, read the live tab URL once. If it exactly equals the evidenced target, omit only waitForURL. Other views and all unconfirmed routes retain the original bounded URL wait and all alert/route fallback behavior. Missing live URL support retains the wait. No cached route, new browser binding, activation retry or new strategy configuration.

Golden chain: approved original draft at a legal calendar window -> existing account and publication baseline -> exact compose navigation -> normal editor/content checks and single activation -> original exact public ID/body/owner/time verification. Uncommitted or missing URL still waits; wrong route, refusal, unknown and deadline still reject.

Validation: synthetic committed/missing/uncommitted URL cases; adjacent navigation/quote/profile tests; types/build/maintainability; one next lawful original publication through the verified local build. The improvement is fewer host calls, not a guaranteed throughput or a fix of all host latency.

Design review: passed; direct current URL is the same authoritative navigation signal as waitForURL, while content/identity/write gates remain. Plan not required for this single bounded source change.

## Validation, review and delivery

Implementation review passed: only composer navigation with a fresh exact target URL skips one host URL wait; missing/uncommitted routes keep it. Other views, content readiness, alert fallback and the caller's exact account/body/window checks remain. No cross-action cache or retry was added.

Full check passed: 833 tests, source/CLI/contract types, build, maintainability, formatting, Skill and generated observation checks. The original interrupted/alert/public-detail cases remain unchanged. A complete live authorized original publication returned verified through this local build. Compose navigation measured about90s versus the preceding about120s; whole-flow latency remains several minutes. This is partial host-overhead reduction, not a guaranteed hourly capacity or complete host-latency repair.

Retrospective completed: favor the established DOM writer and remove only evidenced duplicate transport work. The rejected native binding experiment is outside this source delivery. Consumer business IDs and proof remain private. Source delivery is authorized; no standalone npm/site release is required by maintenance policy. Parent operating target and remaining host latency remain open.
