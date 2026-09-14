# Durable local generations

This is the implementation contract for the next storage slice. Portable backup
versions 1–3, their limits, and the local receipt envelope remain unchanged.
The Swift file layout and Kotlin SQLite schema are private native formats;
neither is a portable backup. Completion requires both native implementations
and their actual lifecycle evidence.

## Publication and recovery

Prepare encrypted data and detached receipts in a uniquely owned inactive
generation. Validate every domain, reference, exact receipt inventory and
authenticated reopen before publishing it. Preserve source snapshot/vault
identity and bind preparation to the receiving store's writer, revision and
incarnation. The existing recovery-key and provider/account/session guards
remain mandatory around asynchronous preparation and immediately before install.
Do not replace a current key envelope while preparing a candidate.

All store instances targeting one database/directory share a write/install
lease. Check the current durable identity under that lease, not merely an
instance's cached state. Publish the active-generation reference and its
pending-verification transition atomically. Retain the complete predecessor,
including its key envelope and receipt groups, until the new generation has
been authenticated after publication. Normal writes cannot race that decision.

Startup resolves a recorded pending transition before exposing a ledger. A
valid new generation becomes active; an invalid pending generation may recover
its recorded authenticated predecessor. Established-vault corruption without
such a transition locks the vault. It must never silently choose older history
or manufacture a new empty vault after key loss.

Use explicit local format versions and domain-separated authentication binding
generation, table/domain and record identity. Authenticate headers, references,
counts and exact membership, including row deletion/substitution. Preserve
existing publication revision, writer and restore-incarnation semantics.

## Receipt ownership and compatibility

Use [the local receipt contract](LOCAL_RECEIPT_CONTRACT.md) for encrypted bytes.
Committed receipt files outlive preparation handles and can be reopened after
process death from authenticated descriptors. Closing a read lease releases
resources; it never deletes committed files. Reuse immutable receipt groups
when ordinary edits leave receipts unchanged.

Garbage collection excludes active, previous, pending and reader-pinned groups.
It removes only demonstrably owned unreferenced entries and preserves unknown
files, replaced names and symlinks. The trusted storage root must be private and
excluded from operating-system backup; receipts use platform file protection.
Simulator filesystem tests do not establish physical iOS data protection.

Initially hydrate detached receipts into the existing bounded in-memory
`Snapshot` API for UI and v1–v3 export. Release file leases only after a coherent
snapshot is fully hydrated. This change does not claim streamed memory usage.
Future streaming needs both a consistent metadata view and pinned receipt
lifetime. Migration from the old native storage must preserve all domains and
bytes, and leave recoverable old state until activation succeeds.

## Shared acceptance inputs

`packages/offline-contract/fixtures/local-generation-v1/lifecycle.json` names
14 required scenarios and the hashes/counts/totals of `previous.json` and
`replacement.json`. Both have expenses, receipts and every finance domain;
replacement changes the source vault, snapshot, receipt identity and expense
content. Both platforms must consume these shared inputs in real storage tests.
The Node test verifies input validity and provenance only. Native reports map
scenario IDs to executed methods and distinguish injected checkpoint failure,
new store instances, actual fresh processes, disk-full and physical power loss.
Do not mark an unexecuted scenario complete because its fixture exists.
