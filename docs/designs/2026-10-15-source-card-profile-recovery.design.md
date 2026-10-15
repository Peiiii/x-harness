# Same-post source-card recovery

Flow: bugfix; risk L2; retrospective pending. Original publication recovery remains the owner; no new write API, action ID or settlement owner.

Observed failure: a submitted original's permalink has exact reviewed prose, its source-card slot stays loading and exposes no link. A fresh public author timeline exposes the same absolute-time post and short link. The existing redirect proof and all exact-text/identity/time/baseline/media guards must remain required.

Design: only for a proven single trailing source, no quote, no alert/state failure, exact target ID/author and prose, and a loading permalink lacking that short link, read at most ten posts from the same public author once. Require the exact profile route/handle, a new bounded observation timestamp, complete read/no missing or alerts, and exactly one matching target with the observed short link. Preserve both observations in the recovery evidence; pass the target through the existing complete publication verifier. Otherwise keep unknown. Never submit or open an editor.

Rejected: accepting a caller-supplied success, copying an old timeline receipt, dropping URL equality, or replacing missing text. Waiting on the permalink alone failed to expose its source card; a second public surface is acceptable only with identical post identity and unchanged final guards.

Acceptance: synthetic loading-card fixture verifies with exact fresh timeline+redirect; wrong body/author/ID/link, stale/incomplete/wrong profile, missing redirect or wrong destination stay unknown; ordinary/quote recovery unchanged. Run type/build and relevant tests, diff review, then verify the original real submission through the root API. No account or real browser evidence enters this repository. No standalone npm release required for tested local adoption.

Design review: passed before implementation. The fallback is read-only, bounded, and does not clear unknown or produce success outside the existing verifier; all failure branches preserve the original evidence/state. Required real adoption remains open until executed.

Implementation/validation: build, maintainability, TypeScript and 23 targeted / 432 full tests passed. Implementation review found no open findings: final exact source/body/author/time/baseline/media guards remain unchanged. A real submitted original was recovered through the rebuilt root after its permalink finished loading; the new profile fallback did not activate in that observation. Its special loading branch is covered by synthetic boundary tests, not claimed as a real-browser fallback success.

Delivery: verified local build is usable without an npm release; actual consumer publishes and original-ID recovery continue through the root. Retrospective completed: preserve both fresh surfaces when async link cards block exact verification, and report which branch actually ran; a successful ordinary recovery is not proof of fallback activation.
