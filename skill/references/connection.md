# Automatic first connection

Only load when no valid binding exists. Select the user's real Chrome using current CUA docs; name its session first when required. Supply `connection.check` as read-only `cua.listTabs({browser:selectedBrowserId,emit:false})`, and `connection.openTab` as `cua.createBrowserTab(selectedBrowserId,'https://x.com',{sessionName:'🔎 X'})`. Never put tab creation, navigation or submission in `check`.

Call `await createXGrowthHarness({connection,ledgerPath,proofDirectory,executor?})` once. `ready` returns `harness`, `tab` and compact `connection`; retain them and run the needed root read in the same script. No model decision belongs between initialization and that read. Reuse valid bindings; no connection check per operation.

Only the exact request-header initialization error is retried once in the read-only check. Other failures stop. Tab creation and business are never replayed. `needsDecision` gives phase, stable reason and diagnostic proof; read only its error/attempts locally. `open-tab` failure may have created a tab: inspect before any new creation. A returned tab is preserved even on bind/proof failure. Restore an unavailable proof directory first. Recovered errors and timings stay local; HTTP errors hidden by the host remain unknown. No fallback search assumption, app reset, vendor patch or policy bypass.
