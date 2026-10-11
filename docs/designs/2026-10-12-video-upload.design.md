# MP4 upload through the existing publish task

The published task accepts assets but the DOM adapter rejects MP4 before submission and routes every attachment through image ALT editing. Repair the existing asset owner; preserve prepared actions, approval, identity, intent, single submission and fresh settlement. No new API or state variants.

A reviewed absolute MP4 path uses the observed Add photos or video button and file chooser, waits for a visible video preview, and returns to the composer without image ALT controls. PNG/JPEG/WebP keep mandatory ALT and their existing editing flow. The composer reader records visible video previews. Public verification requires a video in the matching author/text/time post for MP4; it must reject a text-only or image-only post.

Golden acceptance: a prepared original with one reviewed MP4 → publishPost → preview video → approved text → one submit → fresh matching account/post with video → original action settled verified. Image uploads retain the previous ALT check. Unsupported or relative file paths, missing previews and ambiguous controls fail before submission.

Validation: replay the observed pre-submit MP4 failure at the same boundary; synthetic chooser/DOM adapter tests for MP4, image and rejected paths; public verification tests for video versus missing/wrong media; typecheck, formatting, build and package checks; then resume the original prepared action on the user's real tab using the updated published package.

Design review: passed. The existing chooser, reader and settlement owners cover the target; image regression remains explicit. The task publishes a reviewed short clip; no multi-video, conversion or new upload transport is needed. Plan: not required; one bounded repair. Risk L2 behavior with normal authorized package delivery.

The real MP4 preview appeared before processing finished. The inherited 5-second enabled-submit wait expired without clicking. Wait up to 60 seconds for video processing after filling approved text; keep the existing 5-second image/text wait and pre-submit identity/text re-observation. The failed preparation is cleared through the existing exact-text and media recovery commands before same-ID resumption; no new submission or recovery state.

The selected host capped the longer individual wait at about 5 seconds. Use at most twelve 5-second observation waits for video processing; retry only locator timeout/deadline failures, never host disconnections or submissions. Synthetic tests prove the second wait can succeed, the twelve-wait cap and immediate propagation of other errors. Existing image/text waiting stays one 5-second observation.

Fresh public recovery exposed two adjacent verifier assumptions: it still required image ALT for MP4 and assumed a blank line plus an unshortened source URL. Both normal and recovery verification now share matchesReviewedAssets. Trailing source URLs may use one or more line breaks. The recovery rendering exception strips a display ellipsis and permits omitted www only after the actually opened short link's resolvedURL exactly equals the reviewed URL, its href is in the public post, and the whole remaining body matches. Changed paths, source destinations, media or body still fail. Synthetic real-business recovery tests cover both separators and all negative boundaries; recovery performs no new submit.
