# Local candidate acceptance inputs

`acceptance.json` references the unchanged `local-generation-v1` previous and
replacement snapshots: exact file hashes, domain counts and receipt descriptors.
No snapshot or image bytes are duplicated here. Tests separate each fixture into
complete bounded metadata plus one raw receipt at a time. Base64 is a fixture
convenience, not a candidate storage requirement. Existing caps remain unchanged.

Assertion revision 2 preserves all 18 scenario IDs and their stages. The 15
`preparation` cases retain their original requirements. The three
`installation_if_wired` cases now specify the approved internal local installation
seams. `required_unproven` means these are requirements, not test results. Previous
preparation evidence remains evidence of its recorded revision; it does not prove
installation or the new assertion set.

Install consumes an opaque candidate through its owning store's existing guarded
publication/recovery path. Recheck the real destination, authenticated current
state, revision/incarnation and current key without provisioning. Swift also binds
its existing local writer and store ID; Android binds its database/state/key
envelope without adding a cloud writer dependency. Derive local publication
metadata internally. Fixture IDs and caller-supplied metadata are not installation
authority.

`guarded_install_reopen` compares all eight arrays, incoming vault/snapshot IDs and
original receipt bytes after successful publication and fresh-store reopen.
`candidate_gc_pin_then_stale` proves that GC preserves a retained candidate while
an intervening edit still makes installation stale. `stale_incarnation` requires
rejection when a new authenticated incarnation repeats a numeric revision.
The manifest also specifies same-owner/single-use enforcement, current-key loss,
cancel/failure boundaries and ownership after success, rollback or uncertainty.

Prepublication rejection preserves current data and cleans only owned inactive
data. After publication, each platform keeps its existing cancellation boundary:
Swift must verify rollback before reclaiming candidate bytes; Android's publication
CAS hands the outcome to commit/recovery. Uncertain publication retains potentially
referenced bytes and requires recovery. No result may claim the old vault was kept
without proof. Closing consumed preparation/candidate handles cannot delete active,
predecessor or unknown/replaced files.

Native evidence must map each scenario and detailed assertion to actual methods,
checkpoints and outcomes, recording manifest hash and source/build/runtime identity.
Skipped or unwired cases need a reason and remain unproved. Shared Node tests only
check fixture references and stable evidence IDs. The invalid-image case still
uses the existing PNG corpus and requires actual native decoding.

This remains synchronous local installation of bounded metadata and detached
receipts. Incremental metadata, v4 FINAL/EOF, provider/account/session and downloaded
artifact bindings remain separate. Failure injection and fresh-store reopen do not
prove process-death recovery, physical power loss or physical iOS data protection.
