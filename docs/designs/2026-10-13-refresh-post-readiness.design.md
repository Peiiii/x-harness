# Fresh publication baseline readiness

## Goal and acceptance contract

A refresh can succeed while the host truncates the article wait. Caller retries refresh again and restart loading, preventing an otherwise reviewed reply from reaching submission.

R1: reload once and use the existing bounded article readiness helper to resume a host-capped wait without another refresh.
R2: fresh changed-route, challenge alerts, interrupted connections or exhausted wait budget must fail. No new write path, submission retry or relaxed author/text/time/parent gate.
R3: check source, release and published consumer; resume the same action only if no intent was recorded. Overall comparative reply throughput remains unproven.

## Design and review

Reuse DOMNavigation.handleWaitPublicArticle in handleRefreshPosts. It already caps waits at four attempts and fifteen seconds, checks the fresh unchanged route and alerts after a timeout, and never navigates or submits. Keep existing native loading observation. Profile loading improvements are deferred because an existing read-current-page path works; no expansion of this blocking fix.

Same-executor design review: the fresh publication baseline still reads only after readiness; timeout recovery resumes waiting rather than reloading. Synthetic tests cover capped first wait, exhaustion, changed route, challenge and interruption, each with exactly one reload. No private account or proof enters source.

## Source validation and implementation review

Full source check passes 222 tests, format, source/CLI/contracts types, maintainability, Skill and generated consistency. Diff-only review confirms the change only delegates a bounded read wait; reload count and public verification gates are unchanged. No unresolved source findings. Artifact and live baseline recovery remain pending.
