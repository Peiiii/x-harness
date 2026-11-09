# Native account identity with repeated own-profile links

Flow bugfix. A current profile frame can show two exact personal-profile controls for the same account. Native observation incorrectly requires one DOM/AX control, returning null despite consistent observed identity and blocking an original publication before intent. Real reproduction stays in the consumer proof directory; tests use synthetic accounts.

Recognize identity from exact existing personal-profile link evidence in the same full frame. Collapse case-insensitive identical handle targets; accept one distinct target. Missing links or two distinct targets remain unconfirmed. Never infer the operating account from the page URL, author card or cached frame. Action controls and unique submit targeting are unchanged.

Acceptance: repeated consistent identity works for account/posts/composer; conflicting targets and URL-only identity remain null; native publication/identity adjacent tests and typecheck pass; original consumer frame reproduces the fix; live publisher rebinds and retries only a legal prepared action. Code verification is not public publication.

Design review: approved; no change to identity source, action/intent, retry, authorization or storage. Runtime uses the previously verified source baseline plus this patch, preserving unrelated newer main changes. Source change is merged onto main without touching other working/index changes. No npm release required for this active blocker.

Retrospective: distinguish unique account targets from unique controls. The consumer must inspect actual failure fields instead of labeling a generic boundary error as platform refusal.

Validation: build and maintainability passed (276 files, zero findings); TypeScript typecheck passed; all 80 native tests passed, including seven new identity regressions. The original consumer profile frame returned null before and the observed account after the patch. A missing fake-indexeddb test dependency was installed only in isolated test-deps; no product dependency or working checkout changed.

Implementation review: passed. Same-frame exact personal-profile link labels remain the only source; one distinct handle is required, conflicting links and URL-only pages stay null. No action targeting, persistence, network behavior or write permission changed. Live publication and unknown settlement remain separate acceptance evidence.
