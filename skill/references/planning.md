# Verified success targets and total reservations

An explicit qualification audit may pass `excludedActionIds` with its proof as evidenceRef. Excluded actions keep their real status, counters and history; only qualified-goal matching excludes them. Never use exclusions to repeat submissions or erase results.

Use only when the user explicitly authorized a success target and the original shared reservation plan is full of other contributions or unknowns. `x.planVerifiedTarget({taskId,kind:'reply',target:200,sourceCategories:['mutual','casual'],userAuthorized:true,evidenceRef:goalProof})` requires an executor scoped to the kind and existing authority proof. It performs local CAS planning, no browser I/O.

Returns matchedVerified, remaining, total reservation capacity and preservedUnknown. It records the mapping in original planAdjustments and increases item.planned only as needed; the original user goal does not change. Existing counters, claims, actors and all actual attempts remain. Unknowns never count as successes or get resubmitted. Pacing, source/author gates, real restrictions and night rules still apply. Call before a bounded reviewed batch when capacity is the actual blocker; do not invent targets or treat planning as execution/completion.

For execution, pass `replyBatch({taskId,actions,verifiedTarget:{target:200,sourceCategories:["mutual","casual"],userAuthorized:true,evidenceRef:goalProof}})`. The root batch recalculates before each action and stops new prepared submissions once the verified target is reached; original unknown recovery remains read-only. This closes capacity planning and execution in one business call.
