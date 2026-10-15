# Preserve a committed post after a URL wait timeout

Flow: bugfix. Risk: L2, one read boundary. Retrospective completed.

Consumer evidence: real reply and thread-like operations sometimes return a URL wait timeout; subsequent same-ID verification can confirm the original public reply. No account data or browser evidence is copied into this public repository.

The platform observation owner currently propagates the navigation exception before observing the resulting document. Recover only the exact URL-wait timeout for a posts read: observe once, require no alert and no incomplete-state flag. An already committed exact target continues normal readiness. An unchanged original page with the same nonempty account may navigate the same evidenced URL directly once, then run normal readiness. Never click a submission, refresh, change action IDs or declare verification. Person/composer navigation, other errors, changed routes/accounts, alerts and incomplete state still fail. A second navigation error propagates without a loop.

Design review: accepted. This adds no write retry or relaxed author/body/time/exact-parent acceptance. Returning a ready observation does not imply submission verification. Required checks: eight synthetic boundary cases, existing navigation and receipt regressions, type checks, full check, real original-ID verification and thread-like continuation. Runtime proof remains in the consumer's original ledger.

Validation: `npm run check` passed all 396 tests, type checks, generated observation checks, Skill checks and maintainability. Implementation review found no changed submission/identity/parent acceptance gate. The consumer adopted the checked local build, verified an existing reply under its original ID and advanced the previously blocked original thread-like batch through 30 observed records and seven newly verified likes. A later native target ambiguity stayed unresolved; this is not evidence that every navigation or every thread is fixed.

Retrospective: navigation exceptions are not evidence that the resulting document is absent. Keep the one fresh observation and at most one same-evidenced-URL navigation inside the original read boundary; never ask the model to repeat a write or mark a missing-parent receipt successful. Public package version remains unchanged; fold this consumer-used build into the next related release rather than starting a per-fix npm publication.
