# Follow priority at reply boundaries

The existing shared ledger is the only state owner. A follow backoff is not a reply pause. Conversely, continuing replies must not hide a follow recovery deadline.

The root `runFollowPriorityBatch` API uses the supplied original follow executor and the current reply executor. Before each new reply, and again after a pacing wait, it checks the current follow item and actual shared backoff timestamps. When follow is available it runs the normal follow batch immediately. A due recovery can reopen only the matching, evidenced follow backoff; unrelated blocks and other executor markers remain unchanged. Optional original unknown targets are read-only verified before the recovery batch; they are never submitted again.

At midnight the router returns without any platform operation. It does not weaken normal follow windows, rolling budgets, source review, account serialization, author checks, or unknown guards. Goal totals and reservations remain separate. A successful batch is not a whole daily goal.

Acceptance: before expiry replies proceed; at the exact expiry matching backoff is resumed and follow is selected; expiry during a reply batch prevents its next new reply; mismatch or missing authority cannot reopen a block; newer shared backoff wins; unknown recovery remains read-only; midnight performs neither follow nor reply. Root and real consumer receipts are required before claiming adoption.

Design review: existing write and verification methods are reused, without a second queue, actor, or execution marker. Selection and scoped CAS belong to the original runtime store. The explicit follow actor proof is required; a caller cannot clear arbitrary account restrictions. Findings closed by matching reason, evidence and timestamp validation and live-store recheck.
