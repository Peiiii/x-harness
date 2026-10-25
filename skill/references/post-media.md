# Review observed post images

Use `await x.readPostMedia({target:{postId,url,evidenceRef},maxImages:4})` on the existing root. It fresh-reads that exact post, matches its images to the current browser pageAssets inventory, and exports only those observed images. No screenshots, arbitrary URL downloads, direct asset navigation or platform writes.

`status:'observed',complete:true` returns `images:[{src,path,contentType}]`, sourceEvidenceRef and an original proof. View every local image through the host image viewer before semantic review; an exported file is not approval to reply. Keep source text and qualification proofs.

Partial inventory/export, route drift, quoted-media scope and expiry remain incomplete. Missing pageAssets returns needsCapability; preserve partial paths and repair the owner or continue independent sources. Never invent unseen image content, claim completeness after maxImages truncation, or broaden a failed export into a whole-page download. Executor windows and midnight still stop platform acquisition; local image review may continue.
