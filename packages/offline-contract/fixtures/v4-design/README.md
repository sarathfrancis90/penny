# Public v4 design layouts

**Draft layouts only; no encrypted backup or runtime support.** See `docs/offline/BACKUP_V4_CONTRACT.md` for the candidate wire rules. Do not give these files the `.pennybackup` extension or use their all-zero secretstream header in a production writer.

`layout-vectors.json` includes:

- Exact 70-byte synthetic header, 35-byte HKDF info and 29-byte frame AAD domain.
- Public synthetic HKDF root/salt/PRK/key; expected key also matched the pinned-library feasibility probes.
- Frame headers/AAD for a small logical stream, a full first chunk and the maximum sequence. No ciphertext or final-tag authentication is supplied.
- Two complete plaintext record layouts: empty ledger, and one expense owning one raw receipt. BEGIN/END counts, byte accounting and exact transcript digests are included.

Regenerate with `python3 packages/offline-contract/fixtures/v4-design/generate-layout-vectors.py`. It uses only Python standard-library serialization/hashing/HKDF calculation and existing public fixtures; it does not call or replace secretstream. JSON field order in these vectors fixes the sample bytes, not a canonical wire key order. Actual encrypted native cross-platform vectors remain a separate gate.
