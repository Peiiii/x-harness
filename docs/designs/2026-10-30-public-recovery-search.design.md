# Read-only public recovery after detail timeout

Flow: bugfix; risk L3; phase implementation; retrospective pending.

AC1: Only the original intent/unknown original with a known exact own public URL and existing proof may recover. Detail timeout/deadline errors may trigger one search; connection errors and normal success do not.
AC2: Search is fresh, same account, exact generated query/route, no alerts/state conflict, and a unique full target card. Preserve exact public ID, complete body, reviewed media/quote/link rules, before IDs and submission timestamp. Collection boundedness is not incomplete card text. Reply cards never verify originals.
AC3: No composer, activation, repeated submission, new account probe or unknown rewrite. Original CAS/status settlement unchanged. Preserve detail error in recovery proof.
AC4: Synthetic wrong account/ID/body/time/media, ambiguous/truncated/stale/alert/search route and non-timeout cases fail closed. Natural original pending IDs must be verified through the root after a safe runtime boundary, independently from synthetic tests.

Design review: automatic one-time search only after a recognized read timeout; no user-supplied success flag or trusted caller observation. Existing platform search and final matching/settlement own all evidence. A literal final CDP remaining-time error is not proof that the root budget is 2ms. Long-term host latency remains separate.
