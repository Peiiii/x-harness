# Bookmark folder discovery

Task: expose visible folder discovery through the existing business read API, before a named-folder source read. Flow: standard; implementation and validation complete; retrospective: existing collection navigation already supports named folders, so reuse it rather than adding another browser reader.

`readBookmarks({discoverOnly:true})` opens the selected history/bookmark tab dropdown and returns visible, deduplicated folder names without collecting posts. Default reads still require an observed folder name. Navigation projects only a visible bookmark-specific menu containing the all-bookmarks option; that option and the menu heading are excluded from folders. Missing menus remain incomplete, never interpreted as an empty folder. Named reads retain selected-folder binding evidence in the compact API result.

Acceptance: discovery does not call source collection; missing menu is explicit; default missing folder is rejected; selected folder evidence is retained; types and package contract compile. Four regression tests plus the full suite pass. Live DOM acceptance observed discovery and named-folder reads through the root API, with proof retained only in the private consumer workspace.

Implementation review: no account data or real evidence committed, no inferred folder identifiers, no write or bookmark mutation, no alternate publication state. Native discovery may return an explicit observation gap when its adapter cannot project folder menus. Paging remains bounded and does not assert an entire folder was read.
