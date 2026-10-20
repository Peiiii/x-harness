# Quote preview URL-label compatibility

Flow: bugfix, L2. Retrospective: pending.

An already selected, exact source can have a composer card containing a long
source prefix followed by line-broken protocol/domain labels. The full-source
and existing self-link cases reject this rendering before any submission.

Accept this additional observed shape only with the existing numeric source ID,
matching author, a matching source prefix of at least 80 normalized characters,
and complete URL labels occurring in the reviewed source in the same order.
Unknown URLs, changed content, short prefixes, stray text, invalid source IDs and
wrong authors remain refusals. Keep quote selection, identity, deadlines,
single activation and exact public card/source-ID verification unchanged.

Design review: the new shape does not authorize a source or discover an ID. It
uses the pre-existing exact-source selection binding and requires both prefix
and all visible link labels. No fallback to plain posting or unknown resubmission.

Acceptance: synthetic positive and negative shape tests, existing quote recovery
tests, types/build and diff review; then one authorized original quote after
fresh calendar admission. Real account evidence remains in the private consumer.
