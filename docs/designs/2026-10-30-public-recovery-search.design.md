# Read-only public recovery after detail timeout

Flow: bugfix; risk L3; phase delivery; retrospective completed.

AC1: Only the original intent/unknown original with a known exact own public URL and existing proof may recover. Detail timeout/deadline errors may trigger one search; connection errors and normal success do not.
AC2: Search is fresh, same account, exact generated query/route, no alerts/state conflict, and a unique full target card. Preserve exact public ID, complete body, reviewed media/quote/link rules, before IDs and submission timestamp. Collection boundedness is not incomplete card text. Reply cards never verify originals.
AC3: No composer, activation, repeated submission, new account probe or unknown rewrite. Original CAS/status settlement unchanged. Preserve detail error in recovery proof.
AC4: Synthetic wrong account/ID/body/time/media, ambiguous/truncated/stale/alert/search route and non-timeout cases fail closed. Natural original pending IDs must be verified through the root after a safe runtime boundary, independently from synthetic tests.

Design review: automatic one-time search only after a recognized read timeout; no user-supplied success flag or trusted caller observation. Existing platform search and final matching/settlement own all evidence. A literal final CDP remaining-time error is not proof that the root budget is 2ms. Long-term host latency remains separate.

## Validation and review

AC1–AC3: regression before repair fails; 56 directed and 1225 fast checks pass after repair, including original detail success, no fallback on connection failures, exact card negatives, ambiguity, before-ID/media/quote exclusions. Build/type/contracts, formatting, maintainability and bounded Skill checks pass.

AC4: consumer safely used the immutable build on original pending actions without activation; two original public results verified through the root. The search fallback actually executed but an X timeline load error correctly remained unknown; after the observed page recovered the original detail read verified. Natural successful search acceptance and throughput improvement are not established. No artificial live timeout was injected to manufacture success.

Implementation review: no caller-supplied successful observation, no account warmup, one timeout-only search and original CAS/settlement. Quoted/media recovery remains on the established detail path. Final inner CDP remaining-time text must not be reported as the root call budget. Retrospective: keep partial/failure evidence and distinguish synthetic acceptance, actual branch execution, final public recovery and long-term efficiency.
