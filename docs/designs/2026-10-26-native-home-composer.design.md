# Native home composer recovery

Flow: bugfix; risk L3; design-document required; plan not-required; retrospective pending.

## Goal and evidence
Restore authorized original publication through the existing native App root when browser extension control is unavailable. Actual native home exposes one inline editor, one submit button, and an own-profile navigation link in the same full observation. Standard compose route hides the own-profile link, so existing fresh-identity check correctly refuses activation. Native text parser drops blank lines when present. Actual composer AX Value additionally collapses blank paragraph lines even though the screenshot shows the full spacing, making exact-byte comparison impossible on that representation. No account names, private evidence or local paths belong in this SDK.

## Design
Use the existing publishPost and independentExecution contract; no second publisher. Accept /home as another observed original composer route. Native projection recognizes it only with an exact home web area, one own-profile navigation link, one named post editor and one post-submit button. Return only editor/submit evidence from the home composer, excluding timeline cards so those cannot become reply targets. Existing native account extraction still uses the full same observation. Preserve empty continuation lines within AX Value labels so reviewed paragraph boundaries remain exact. No identity cache. Native composer observations explicitly declare their AX line representation; platform composition compares the reviewed text through that representation only, collapsing runs of empty lines on both sides while preserving every nonempty line and character. This applies only to editor verification, never public-result matching. The original exact public body check remains mandatory.

Keep existing blank-editor, exact-body, account, alert, beforeSubmit, calendar, quality and unknown protections. A missing/ambiguous composer remains needsStateCheck; an arbitrary route remains refused. No migration or new persistent fields. Existing compose and inline reply paths retain their boundaries. Source collection remains independently blocked where native capabilities are absent.

## User chain and alternatives
The executor selects its owned home tab, reads current account, loads a legal reviewed draft, invokes the existing root once, then verifies the unique public post/body/author/time. Only public verification closes the publication result. Expired windows are skipped, and unknown remains same-ID verification. Reusing a modal with no handle evidence or replacing account checks with cached identity would lose a real guard and is rejected. Waiting repeatedly on unresponsive extension control does not provide publication progress.

## Active acceptance ledger
Contract-id native-home-20261026; scope revision 1; parent-goal restore original publishing while preserving boundaries. Authorized by ongoing publishing and necessary harness repair instructions.

| ID | Required | Status | Evidence |
| --- | --- | --- | --- |
| NH1 | true | passed | Exact home composer accepted and multiline body preserved |
| NH2 | true | passed | Missing/ambiguous identity/editor, wrong route, altered body and expired windows cannot activate |
| NH3 | true | passed | Existing standard compose and inline replies retain behavior |
| NH4 | true | blocked | One currently legal actual original published once and exact public result verified |
| NH5 | true | not-run | Necessary SDK delta typechecked, reviewed, committed/pushed; consumer uses verified build |

Design review: passed before implementation; amended after actual host AX Value and screenshot proved collapsed editor paragraph lines. The amended comparison is restricted to native editor representation; exact public body remains required. Rechecked user result, same-observation identity, timeline exclusion, no arbitrary-route acceptance and preserved submission guards. No open design findings. NH4 remains required: synthetic tests cannot prove host recovery. No scope reduction.

## Native keyboard activation amendment
The existing public activation=keyboard option was ignored by NativeXBrowser. For native submit only, close only positively observed hashtag autocomplete suggestions with Escape, then move through real Tab focus with full composer observations until the unique enabled submit button itself is focused. Enter activates it once, after the original beforeSubmit guard. A bounded focus search that cannot establish the button fails before activation. Never click and then press Enter. No changes to unknown recovery or public result verification. Re-review: this restores an existing activation contract and avoids an inferred click outcome; validate native call order and actual publication separately.

## Validation and actual recovery boundary
TypeScript compilation and 48 targeted tests pass, including actual NativeXBrowser plus platform composition boundary, unchanged author/text guard, wrong routes, focused keyboard activation and refusal before Enter, original time windows/cadence and public publication matching. Maintainability found no findings. Implementation review: no findings in the isolated delta; full same-observation actor/editor is rechecked while traversing keyboard focus and final beforeSubmit remains immediately before Enter. Public text matching is unchanged.

Live home editor/account now passes and an original action reached one native click, but public verification remains unknown. A subsequent independent profile read did not find it in the bounded latest window; absence is not proven and it must not be resubmitted. A premature navigation produced a leave-page warning and was cancelled. Extension control still timed out after cancellation. The live keyboard attempt exposed that unconditional Escape opens a discard dialog and a prematurely called beforeSubmit reserves activation before focus is established. The discard was cancelled and the unknown record retained. Both implementation defects are corrected: Escape requires observed hashtag autocomplete and beforeSubmit is called only at final button focus. The revised keyboard path has only synthetic validation; it is not declared production-restored. NH4 remains blocked, no completion or npm release claim. Existing successful runtime is retained.

Retrospective: return to recovery/verification, not completed. Durable increment is the explicit native AX representation and real focus boundary tests; do not confuse native identity/read recovery, local tests, or click activation with verified publication. No new global instructions.
