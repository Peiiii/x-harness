# Propagate the configured owned-tab read budget

Bugfix L2, one SDK owner. Public `tabReadRecovery.readTimeoutMs` already sets the recovery envelope, but binding construction drops it before both primary and rebound DOM adapters; their primitive deadline remains 5000ms. A normal slower host read can time out and leave the original pending latch. Consumer proofs show `browser-read-pending:observe:account`; this is not proof of an X refusal or that every pending read has this cause.

Pass the existing optional value into the shared DOM options. Undefined retains the current default. Do not add another option, change business pacing, cancel or retry activation, release a pending latch, or accept a late result. Recovery still validates the public range, binds the exact same tab once and preserves original claims/unknowns.

Acceptance: public factory sends the configured budget to primary and rebound DOM reads; the new integration cases fail against the previous binding and pass after the fix. Existing deadline tests must continue rejecting stalled and late reads, preserving pre-submit cleanup and no replay. Run adjacent binding/fallback/deadline tests, full checks and the original consumer's fresh safe binding with an explicit budget. Runtime adoption and a new public/durable result remain separate from synthetic checks.

Design review: the existing option is the nearest owner and a zero-code caller-only workaround cannot change the inner adapter budget. Both constructions share `domOptions`, so one propagation line covers initial, same-tab recovery and isolated native-read preparation. No default/global deadline increase and no new framework or scheduling rule.
