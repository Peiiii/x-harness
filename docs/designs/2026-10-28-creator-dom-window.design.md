# Bounded creator DOM window

Creator collection currently asks for up to 25 posts but reads the already rendered DOM five posts per browser call. On a host where each call can take tens of seconds, that pagination magnifies latency. Permit an explicit internal bounded bulk option for visible post observations, limited to 50, and use the requested creator target as the chunk size. Keep normal read limits, ordering, offsets, pinned/repost filtering, scrolling, alerts and absolute-time checks unchanged. No hidden transport, concurrent navigation or expanded platform permission is involved.

Verify normal mode still rejects oversized windows; bulk preserves offsets and visible post evidence; a 25-post creator fixture needs one DOM observation per rendered window instead of five. Compare a real same-channel operation if the browser becomes available. This optimization does not establish why the host stalls or prove any comment was sent.
