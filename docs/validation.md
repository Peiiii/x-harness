# Open-source migration and object model

Required contract: stable task APIs, one operation owns capability/intent/submission/verification/settlement, compact receipt/decision/delta output, no source reading for ordinary use.

Implementation review: class bodies own business behavior and private per-instance state. Public methods preserve callback binding. Internal browser reads retain separate methods so a serialized write does not re-enter its own mutex. Browser descriptor callbacks retain lexical instance ownership. Pure browser programs remain self-contained and serializable. Dependency bags are narrowed by each constructor, with no persistent duplicate bag when used only at construction. No unresolved findings in this source snapshot.

Evidence before first release: typecheck, declaration contract tests, formatting, dependency-cycle/1000-line/150-own-line gates; 68 behavioral tests pass, including cache isolation, detached methods, per-instance mutex and error release, one submission with recovery, native loading/creator behavior, complete target text and compact result limits. Skill examples compile; progressive-loading character budgets pass. These are synthetic/offline checks, not claims of new live X submissions.

AI development system: npm run bootstrap installs/checks Qingtian 0.1.3 and enables the staged hook. Managed upstream rules stay local and excluded from distribution. Fresh-clone bootstrap/check passed for 0.2.0. Source repositories are independent; the private parent consumes npm. Release archive, public installation/upgrade and private-parent integration results are recorded after deployment.
