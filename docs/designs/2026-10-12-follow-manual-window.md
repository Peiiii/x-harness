# Follow budget gate must share the scoped manual window

Flow: bugfix. Risk: L2. Parent task remains active until real business verification.

A current, scoped manual permit passes the shared execution gate but follow budget checks independently reject nighttime calls. The failing boundary is GrowthPolicy.waitBudget; no browser or authentication bypass is needed.

Reuse authorizedWindow(state, 'follow') in this gate. Keep all existing coverage, group-spacing, rolling-attempt and platform checks. Do not alter default hours, clocks, permit shape or global state. Missing, expired, future, wrong-executor, wrong-kind and missing-proof permits remain rejected. A valid permit does not grant extra budget.

Design review: passed. The shared helper already owns expiry, scope and proof validation; using it removes inconsistent duplicated window logic without adding a new authorization path. No unrelated WIP belongs to this fix.

Acceptance: reproduce the rejection through public followOne; valid permit verifies one synthetic follow; invalid permits submit zero; valid permit with exhausted rolling budget submits zero. Typecheck and relevant follow tests must pass. Real caller must then resume its original prepared batch; test success is not its completion.
