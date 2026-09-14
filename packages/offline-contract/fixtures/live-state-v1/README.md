# Live-state metadata-edit golden

`metadata-edit.json` binds the existing actual Android v4 writer backup and its complete expected snapshot. The key is public synthetic test material. Native tests on both platforms import that file, edit only the named expense through the receipt-free metadata path, and compare the exact resulting records and original receipt bytes. Local snapshot/revision/export IDs may change according to the existing publication contract; they are not domain data.

The receipt belongs to the edited expense. Its local encrypted-file hash and authenticated descriptor must remain identical across metadata edit; every other expense and all listed domains must remain equal by record ID. The legacy compatibility snapshot must still contain the original image. Never regenerate the referenced captured ciphertext.

The acceptance IDs map to [the live-state contract](../../../../docs/offline/LIVE_STATE.md). Test reports must distinguish implemented paths and unperformed resource or physical checks. This fixture is not larger-capacity acceptance.
