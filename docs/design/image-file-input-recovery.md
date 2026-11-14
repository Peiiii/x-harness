# Image file-input recovery

Bugfix, risk L2. The authorized image reply reached the media toolbar but the semantic media button timed out waiting for a file chooser. The same live editor has one enabled input[type=file] accepting images. Browser documentation prefers clicking that actual input. The permission toggle state is unknown; a chooser timeout cannot establish that access is disabled.

Prefer a unique file input after retaining the original fresh composer/alert and unique semantic button checks. Arm exactly one chooser before the click; preserve the button path for hosts without an input locator or with multiple inputs. No retry after setFiles, no automatic publication, no permissions changes or alternative network upload. Original ALT, preview, intent, parent, exact-text and public-media checks remain.

Design review: clicking a unique input changes only chooser activation; ambiguous inputs do not pick an index. Local regression must cover selection order, legacy button selection, and unconfirmed composer veto. A real original-ID image upload and public image readback are required before claiming restoration. If the input path still times out, retain the unsubmitted action and investigate a documented clipboard path rather than assert a disabled setting.
