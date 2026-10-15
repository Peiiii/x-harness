# Exact link rendering recovery

For one trailing source, `sourceLink: {href,resolvedURL,evidenceRef,renderedText?}` keeps its existing source-card behavior.

For multiple inline shortened links, call the same `verifyPublishedPost` with `sourceLinks: [{href,resolvedURL,evidenceRef,renderedText}]`. Each actual destination needs observed navigation proof. Every href must occur in fresh post links; every renderedText must exactly name a unique fragment of the fresh body and every resolvedURL must occur once as a complete HTTPS URL in the reviewed action. Repeated destinations, duplicate mappings or overlapping fragments keep unknown.

The harness restores only these exact fragments, then requires whole-body equality. Author, time, unique public ID, expansion, image and ALT checks remain. Missing proof or a wrong target keeps unknown. This is read-only recovery of the same submitted action, never a new submission.

A loading permalink source-card slot may receive one bounded fresh read of the same public author timeline. Only an exact same-ID/author post with the observed short link and a confirmed fresh profile can supplement that read. Both surfaces remain in evidence; existing text, redirect, time, baseline, media and alert checks still decide verification. Missing/inconsistent timeline evidence keeps unknown; this never submits again.
