# Optional reply emoji policy

A consumer repeatedly adds emoji to otherwise distinct replies. Per-message content review does not prevent a whole batch from sharing the same visual ending.

The existing executor and GrowthPolicy input gate own an optional replyEmojiPolicy with sampleRate and maxInRecent. The consumer owns editorial values. For a new prepared reply containing emoji, inspect the prior nine reply intents ordered by intentAt; include unknown and verified submissions, exclude unsent prepared drafts. Reject consecutive emoji and a projected ten-message count above the configured maximum. SHA-256 of the stable original action ID supplies a reproducible sample; editing text or restarting does not redraw it. No emoji is ever inserted by the program.

Plain replies pass the style gate. Existing intent/unknown/verified recovery bypasses new-draft style decisions. Invalid configuration fails closed. Style refusal happens before browser work or creation of a new intent; the same unsent draft may be edited and reviewed again. Root age, identity, quality and platform gates remain independent.

Acceptance: deterministic low-rate selection; rolling and consecutive rejection; plain drafts allowed during historical overuse; no writes or intents on refusal; prior unknown verification remains available; unconfigured consumers unchanged. Synthetic policy and assembled business tests cover these branches. Adopt the released package with the consumer's declared policy, then submit a newly reviewed plain reply through the original flow.

Design review: passed. One existing submission gate owns enforcement; no parallel browser runner or new business state. Semantic variety remains content review. Plan: not required, one bounded bugfix batch.
