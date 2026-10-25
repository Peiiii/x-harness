# Optional reply discovery likes gate

Bugfix, L2. The existing root discovery API always applies a 20-like floor, including when a caller's operating policy has no likes requirement. Repeated searches therefore discard otherwise reviewable source evidence.

Extend the existing `ReplyDiscoveryOptions.minLikes` to `number | null`. Omission preserves the existing 20-like default; explicit null disables only the likes qualification. Numeric zero still requires an observed numeric count. Unknown counts remain unknown. No changes to time, language, completeness, author history, executor windows, semantic review, write admission or pagination.

Acceptance: assembled discovery tests reproduce null rejecting low/missing counts before repair; afterward null returns those complete sources for review without fabricating metrics. Omitted, zero and positive thresholds retain their behavior; malformed numeric options fail before browser calls; null does not bypass the other gates. Typecheck/build and directed existing tests must pass. Consumer adoption must verify frozen module hashes and exercise the actual root with explicit null; candidate counts and latency are observations, not proof of sustained reply throughput.

Design review: passed. The existing root/options own the change; no new wrapper or policy owner is introduced. Source-only tests cannot establish live throughput, so live adoption and continued business execution remain required separately.

Validation: null regression failed before repair (only the 25-like source survived); afterward all 37 directed discovery/author/window tests pass, including 21 discovery tests. Typecheck, public contract typecheck and build passed; package maintainability has no findings. Implementation review: no findings; null returns only after other source gates, history remains applied downstream, default validation remains compatible, and explicit null does not authorize writes. Live consumer results remain pending.
