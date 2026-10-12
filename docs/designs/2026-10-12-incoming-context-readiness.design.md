# Incoming context readiness

An incoming detail page can render its target before the author's earlier messages. Two immediate reads do not establish that the conversation has finished loading; the caller currently needs an extra model turn to finish the same read.

Use the existing readPost → platform observation → waitForPosts path. readIncomingConversations supplies the ledger's account handle as internal read context. The platform waits at most five seconds for a different article from that account, then reads fresh context. The DOM wait is only a loading signal: exact author, parent edges, root and completeness checks still decide whether the conversation is usable. No new public API, persisted state, reload, submission or external polling is added.

On timeout or missing ancestry, retain an incomplete result and prevent a second identical loading wait. Other targets continue. Native readers retain their supported observation behavior and must not invent ancestry. Custom platform implementations retain the prior bounded second read.

Acceptance: one business call reads a delayed owned ancestor and the complete target; a permanently absent ancestor stays incomplete after one wait; a ready conversation performs no wait; alerts are never bypassed. Synthetic assembled platform tests cover these branches. After release, use the published package on a real incoming conversation; do not submit a duplicate for validation.

Design review: passed. The observation owner retains the only loading primitive; the marker only reports an exhausted read, never permission to write. Plan: not required; one bounded bugfix batch.
