# Original automatic receipt recovery

Bugfix L3; implementation. Expected: after one activated text original, a public receipt timeout or readable unmatched timeline can use one fresh exact own-account search in the same root call. Existing explicit-URL recovery does not cover that call.

AC1 normal verified receipts and all baselines/replies/follows add zero search. AC2 only intent/unknown text originals with before IDs and original timestamp qualify; no media/quote loosening. AC3 fresh own account/query/route, complete unique own full body, exact permalink, post-submit time and before-ID exclusion; alerts, truncation, replies and ambiguity refuse. AC4 search failure remains unknown with both errors, no second submit, CAS/settlement unchanged. Live acceptance uses original pending actions or next normal authorized publication, never new diagnostic posts.

Design review: shared Platform.findSubmission wrapper covers root publication and unknown recovery; default success is unchanged. This is public receipt recovery, not platform rate-limit recovery; no policy refusal or connection security rejection is retried. Keep unknown IDs and original owner. Baseline navigation latency remains a separate open item.

AC5: an observed own-profile link that times out before activation may make one readonly goto only after a fresh same-original-route/no-alert/account-present inspection. A changed route, policy/connection error, strict observed receipt and non-post view retain refusal. No identity inspection on normal success. Seven dedicated navigation cases plus adjacent routing pass.
