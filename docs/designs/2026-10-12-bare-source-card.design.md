# Bare source-card recovery

Flow: bugfix; risk L2; retrospective_state: completed.

A reviewed trailing bare domain can be rendered by X as an external source card. The existing recovery only recognizes HTTPS text, leaving a visible post unknown. Extend the existing source normalization to a trailing bare domain with a path, canonicalized to HTTPS. Keep exact content, author, post ID, baseline, timestamp, expansion, assets and real redirect-proof checks. Recovery stays read-only and cannot resubmit. No ledger migration or new state.

Acceptance: synthetic bare-domain/card recovery passes; wrong destination, missing redirect proof, changed body/author/time/baseline and partial observation remain unknown. Existing HTTPS and media tests plus type checks pass. Live original remains same action and same public ID; validate via source evidence retained only in the consumer workspace.

Design review: local parser change within the existing explicit sourceLink proof path, no new permission or browser write. No finding. Isolated checkout excludes other maintainers’ working changes; release exact files only.

Validation: full check passed, 107 tests; type, contracts, CLI, format and maintainability gates passed. Implementation review: no findings; source canonicalization is allowed only with observed short-link destination proof and exact remaining body; no mutation path added. Formatting-only correction to growth-policy was required for the existing HEAD check. Retrospective: URL display form is not submission failure; preserve the original action and resolve only the missing rendering evidence. Live verification remains a consumer-owned follow-up, never store real account data here.
