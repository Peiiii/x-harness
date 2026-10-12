# Exact link rendering recovery

For one trailing source, `sourceLink: {href,resolvedURL,evidenceRef,renderedText?}` keeps its existing source-card behavior.

For multiple inline shortened links, call the same `verifyPublishedPost` with `sourceLinks: [{href,resolvedURL,evidenceRef,renderedText}]`. Each actual destination needs observed navigation proof. Every href must occur in fresh post links; every renderedText must exactly name a unique fragment of the fresh body and every resolvedURL must occur once as a complete HTTPS URL in the reviewed action. Repeated destinations, duplicate mappings or overlapping fragments keep unknown.

The harness restores only these exact fragments, then requires whole-body equality. Author, time, unique public ID, expansion, image and ALT checks remain. Missing proof or a wrong target keeps unknown. This is read-only recovery of the same submitted action, never a new submission.
