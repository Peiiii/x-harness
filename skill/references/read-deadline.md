# Bounded browser reads

Observation, screenshot and incident-prone navigation read primitives have a local 5s deadline in addition to the host timeout. `browser-read-timeout:<operation>:<ms>` identifies the read. `browser-read-pending` means its underlying read is still pending; another read is not queued on that binding. Its late result is discarded. Normal fast reads add no browser requests.

This does not cancel the external request or prove the browser is healthy. No local race wraps activation, fill, navigation or submission. Pre-submit failure uses original finally/CAS cleanup; intent/unknown remains the original ID and is verified, never resent. A new host kernel reset still needs positive original termination evidence before old claim recovery.

Keep the healthy runtime. Inspect the named stage and original proof, change the failing condition via documented owned-page recovery or another legitimate independently owned page; do not loop the same stalled binding or reset the kernel for a read timeout. Existing policy refusals/rate limits remain account-wide. A local timeout is not429. Resume authorized independent unsubmitted work and verify actual results. Host binding and other unwrapped methods can still fail; do not claim universal cancellation.
