# Recommendation source author identity

flow: standard; task-type: feature; risk: L2; retrospective_state: completed

The active consumer currently opens every candidate profile after a recommendation batch even though the rendered source card already exposes its author and blue verification badge. Extend the existing source evidence path, without another task API, account requests or navigation.

readPosts reads the unique visible User-Name header matching the primary permalink author, exact profile links and the visible verified SVG label/color. It returns authorIdentity with handle/name/profileURL, blue=true only for a unique observed blue badge, otherwise null and missing reasons. Quoted authors, another article, ambiguous headers and generic nonblue badges never provide positive verification. No absence means unverified; no person/industry/relationship inference. Existing platform source and compact read projection carry this optional evidence on each post; outer proof/observedAt/sourceOrigin remain authoritative. Native/older readers may omit it.

A1: multiple rendered cards return separate exact author identities in the same DOM read, no profile navigation
A2: quoted/foreign/hidden/ambiguous badges and missing headers stay unknown
A3: source and readResult preserve matching identity but reject mismatched handles/profile URLs
A4: current API shape, complete body, provenance, alert/time/account gates and bounded paging remain intact
A5: type/build, directed regressions, maintainability and implementation review pass; actual root recommendation call returns author fields and is adopted by consumer without profile reads for blue-confirmed cards

Design review: passed. Small optional read-evidence addition, no persistent state or writes, no new access. Plan: one bounded implementation/validation batch. Live proofs and real identities remain in the private consumer, synthetic data only in this repository.

Validation: 655 full tests, type/build/contracts, format, generated-reader consistency, 13 Skill examples and maintainability passed. Implementation review: no findings. Actual root read returned five matching blue-confirmed source authors with original For-you provenance; consumer batch reader then consumed the optional evidence without profile API calls. Live proof and individual qualifications remain private to the consumer. No whole-list or growth-effect claim.

Retrospective: the missing evidence belonged in the existing card read/compact projection, not per-candidate model orchestration. Preserve unknowns rather than expanding profiles automatically; no new global workflow rule. Source/local adoption delivery is complete; public npm version remains pending consolidated reader release.
