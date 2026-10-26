# Browser account reader

`src/browser-account.ts` owns a finite read-only account task for a Chrome extension host. It reuses the existing serializable `readProfile` program and preserves exact/rounded count precision. Local checked builds expose `dist/browser-account.js`; this entry is not yet a published npm subpath.

```js
import { BrowserAccountReader } from './harness/browser-account.js';
const reader = new BrowserAccountReader(chrome, beforePlatformRead);
const snapshot = await reader.read(previousBinding?.handle);
```

The host supplies `tabs.create/get/update/remove` and `scripting.executeScript`. It requires Chrome `scripting` plus X host permission; Chrome tab creation/cleanup does not require broad browsing-history access. `beforePlatformRead` is the consumer's fresh time/permission guard and runs before navigation and each observation. The reader creates its own inactive tab, observes the signed-in account's profile-navigation link, opens that profile, reads both counters, verifies identity again and closes its tab on success or failure. It never borrows a caller's editor, reads cookies, sends account writes or stores a binding. Binding, UI transport and durable snapshots belong to the consumer.

Passing an expected handle prevents silently replacing an existing binding when the signed-in account changes. Missing/ambiguous identity and counters are bounded waits; login/access routes and platform alerts fail without replay. Concurrent reads on the same instance reject. Counts remain unavailable when the page does not provide them. A consumer should retain its previous successful snapshot and original observation time after an error.

Validation: `test/browser-account.test.mjs` covers independent tab lifecycle, identity changes, refusal, fresh guards and concurrent calls. The live consumer builds from checked source and records source hashes plus this repository's commit; live accounts and proofs stay in the private consumer repository. No npm release is implied by the local build. Source license: AGPL-3.0-only.
