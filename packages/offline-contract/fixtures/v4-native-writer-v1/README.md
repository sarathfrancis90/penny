# Captured native v4 writer fixtures

These are actual encrypted outputs from the Android and iOS app writers, with
synthetic finance/receipt records and the public test recovery key `pny1-` plus
`07` repeated 32 times. They contain no user data or production credentials.

Each provenance file pins the exact captured ciphertext and expected schema3
snapshot. Encryption uses native secure randomness; regenerating an export is
not expected to reproduce these ciphertext bytes. Preserve the captured files
when replaying interoperability tests.

The opposite native app must authenticate and prepare the file, explicitly
install its candidate, reopen the store and compare all financial domains and
receipt bytes with the expected snapshot. The portable fixture test checks
artifact integrity and expected-record validity; it does not claim native
decryption, installation or device recovery. Platform evidence records those
runtime results separately.
