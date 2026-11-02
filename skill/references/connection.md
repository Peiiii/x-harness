# Automatic first connection

Only load when no valid binding exists. Select the user's real Chrome using current CUA docs; name its session first when required. With the selected browser's documented Browser API, supply `connection.check` as read-only `browser.tabs.list()`, and `connection.openTab` as an async callback that calls `browser.tabs.new()`, navigates that tab to X, then returns the raw tab. This avoids wrapper APIs' automatic AX/snapshot read during connection. If the host only supports CUA wrappers, use their documented entry and retain its exact initialization failure. Never put tab creation, navigation or submission in `check`.

Call `await createXGrowthHarness({connection,ledgerPath,proofDirectory,executor?})` once. `ready` returns `harness`, `tab` and compact `connection`; retain them and run the needed root read in the same script. No model decision belongs between initialization and that read. Reuse valid bindings; no connection check per operation.

Only the exact request-header initialization error is retried once in the read-only check. Other failures stop. Tab creation and business are never replayed. `needsDecision` gives phase, stable reason and diagnostic proof; read only its error/attempts locally. `open-tab` failure may have created a tab: inspect before any new creation. A returned tab is preserved even on bind/proof failure. Restore an unavailable proof directory first. Recovered errors and timings stay local; HTTP errors hidden by the host remain unknown. No fallback search assumption, app reset, vendor patch or policy bypass.

Interrupted control: [owned tab recovery](owned-tab-recovery.md).
