# Legacy receipt evidence acquisition

`acquire-legacy-receipts.mjs` acquires bounded **current** Firebase Storage originals
referenced by a previously saved raw Firestore export. It produces a separate,
sensitive plaintext JSON evidence bundle. It never changes Firestore, Storage,
the source export, or native vault data. Base64 is encoding, not encryption.

The result always declares `storageSnapshotConsistent:false`,
`migrationReady:false`, `nativeImageValidated:false`,
`historicalGenerationDownload:false`, and `sourceExportReauthenticated:false`.
The locally supplied source file and explicit mapping are provenance inputs,
not signed attestations; their SHA-256 values bind the exact input bytes. A newly
verified user token authenticates Storage acquisition, not the historical source
file. No live credential/data or deployed rules/App Check proof is included in
the local fake-transport tests.

## Inputs and command

Requires Node with standard fetch/Web Streams and crypto APIs; no package install
or new dependency. First create a raw export using [the raw exporter](LEGACY_RAW_EXPORT.md).
Keep the source, mapping, token and output in a trusted owner-only directory
(0700). Input files must be owner-only regular files (0600 recommended), with one
hard link and no symlinks. Token contents are bounded to 16 KiB and never logged.

Supply an explicit mapping; no URL parser, URL fetch or URL-to-path guess exists:

```json
{
  "format": "penny-legacy-receipt-map-v1",
  "project": "penny-test",
  "userId": "public-user",
  "bucket": "penny-test.appspot.com",
  "readTime": "2026-09-13T12:00:00.000000Z",
  "sourceSha256": "<64 lowercase hex characters: SHA-256 of exact raw export file>",
  "receipts": [
    {
      "document": "projects/penny-test/databases/(default)/documents/expenses/e1",
      "object": "receipts/public-user/example.png"
    }
  ]
}
```

```sh
node scripts/offline/acquire-legacy-receipts.mjs \
  --project penny-test --user public-user --bucket penny-test.appspot.com \
  --token-file /private/export/firebase-id-token \
  --source /private/export/raw.json --mapping /private/export/receipt-map.json \
  --output /private/export/receipt-evidence.json
```

Project, UID, bucket, source SHA-256 and readTime must match exactly. Mapping
fields are closed, duplicate JSON keys rejected. Every non-null receipt reference
in the source expense domain must occur once in the mapping. Null receipt fields
need no mapping; unsupported typed references fail. The script checks source
expense owner, path, timestamps and receipt-reference correspondence. It preserves
the raw file externally; it does not reinterpret unsupported finances or groups
as personal data. Multiple source documents may explicitly name the same object;
that object is acquired once and retains all referring document names.

Objects must be exactly `receipts/<verified UID>/<single-name>`. The conservative
name subset rejects slash, backslash, percent, query/fragment markers, controls,
surrogate code points, empty names and `.`/`..`. Names are never local filenames.
Rejects do not establish that the original reference was invalid; they mean this
adapter cannot acquire it. The bucket is explicit configuration, never inferred
from a source URL. There is no bucket enumeration or arbitrary destination host.

## Acquisition and limits

The token is verified with the existing raw exporter's Node RSA-SHA256 verifier,
official signing certificates and exact Firebase project/UID/claim checks.
Each Storage request uses `Authorization: Firebase <ID token>`. It constructs only
`https://firebasestorage.googleapis.com/v0/b/<encoded bucket>/o/<encoded object>`
for metadata and that endpoint plus `?alt=media` for bytes. Redirects fail.

1. Read metadata. Require exact bucket/name, decimal-string generation and
   metageneration, integer-string size, canonical Base64 MD5, image content type,
   and valid timestamps. `timeCreated <= updated <= source readTime` is mandatory.
   Unsupported encoding or missing MD5 fails. No historical fallback occurs.
2. Download the complete original. Require HTTP 200, no Content-Range or content
   transformation, declared length matching metadata when supplied, exact counted
   bytes and actual EOF. No Range request or SDK truncation is used. MD5 must match
   metadata; compute SHA-256 independently for the evidence identity.
3. Read metadata again. Require unchanged generation, metageneration, identity,
   length, checksum, times, media type and encoding. Recheck token validity between
   responses. A failed second read or a changed field rejects the entire attempt.
4. Only after every object succeeds, publish a new owner-only bundle containing
   selected before/after metadata, source-document bindings, exact original Base64,
   byte counts and SHA-256. Download tokens, raw receipt URLs, custom metadata and
   server media links are never copied into this bundle.

| Bound | Value |
| --- | --- |
| Unique objects / mapped references | 100 / 1,000 |
| Original bytes per object | 10 MiB inclusive |
| Aggregate original bytes | 16 MiB |
| Metadata response | 64 KiB per read |
| Local source / mapping input | 64 MiB / 1 MiB |
| Request / whole acquisition deadline | 30 seconds / 15 minutes |

These are acquisition limits, not raised product limits. Native receipts still
require separate full image decoding and the existing 2 MiB each / 8 MiB aggregate
caps. Original bytes are never optimized, truncated or converted to meet them.
The raw API's upload ceiling allows 10 MiB inclusive; direct Storage rules use a
strictly smaller-than-10-MiB write check. This reader can preserve either source.

Memory is bounded but this is not a streaming archive writer: one original is
buffered at a time, accepted originals remain Base64 in the bounded result, and
the final JSON is serialized for publication. Source parsing, Base64 expansion,
JSON strings and filesystem buffers add overhead beyond the 16 MiB original cap.
Owned byte buffers are cleared on release; JavaScript strings and runtime copies
cannot be guaranteed erased. No intermediate original image files are created.

## Publication and consistency boundary

Reuses `publishEvidence`: an exclusive 0600 temporary file is written and synced,
hard-linked atomically to a new destination, the temporary name removed, and the
parent directory synced. Existing paths, including symlinks, are never overwritten.
Failure before publication leaves no successful destination and removes the owned
stage. A filesystem failure after the final link can leave a complete destination
with uncertain durability; CLI success is withheld. Do not delete such an output
automatically or mistake its presence for a successful command.

This is pathname-based publication inside a trusted private directory. It assumes
no concurrent namespace mutation by another process running as the same owner;
it does not claim descriptor-relative confinement or secure deletion. Keep these
plaintext artifacts in appropriately protected storage. CLI messages contain only
aggregate counts and fixed failure text.

MD5 is the service's content checksum, not a security signature. Before/after
generation agreement is current-object evidence, not a server-pinned read.
Timestamps after Firestore T fail conservatively, even for benign later metadata
changes. Missing, replaced, stale or unsupported objects make acquisition fail,
not become omitted-success records. The adapter cannot reconstruct objects that
were present at T and later changed/deleted. An unchanged current object does not
prove a transaction spanning Firestore and Storage, nor authenticity of an edited
local source file. Converter, financial reconciliation, native image admission,
and complete migration remain separate gates.

## Sources and validation

Official SDK 0.14.0 [auth header construction](https://github.com/firebase/firebase-js-sdk/blob/%40firebase/storage%400.14.0/packages/storage/src/implementation/request.ts)
and [request construction](https://github.com/firebase/firebase-js-sdk/blob/%40firebase/storage%400.14.0/packages/storage/src/implementation/requests.ts)
establish the Firebase endpoint behavior. Its [reference implementation](https://github.com/firebase/firebase-js-sdk/blob/%40firebase/storage%400.14.0/packages/storage/src/reference.ts)
clips bounded SDK downloads, hence the independent EOF check here.
[Cloud Storage metadata](https://docs.cloud.google.com/storage/docs/metadata)
defines version identifiers and checksums; [object fields](https://docs.cloud.google.com/storage/docs/json_api/v1/objects)
define creation and modification times. GCS [objects.get](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get)
supports generation selection on a different IAM-authorized endpoint. This does
not establish Firebase `/v0` generation-query support; this adapter sends none.

```sh
node --test scripts/offline/acquire-legacy-receipts.test.mjs scripts/offline/export-legacy-raw.test.mjs
npx eslint scripts/offline/acquire-legacy-receipts.mjs scripts/offline/acquire-legacy-receipts.test.mjs scripts/offline/export-legacy-raw.mjs
```

Tests use generated public test identities and fake certificate/Storage responses.
They cover exact original roundtrip, mapping/owner/coverage checks, null and shared
references, metadata changes/missing reads, signature identity/expiry, checksum
mismatch, short/excess/partial/transformed responses, abort, full 10 MiB acquisition,
aggregate rejection, private exclusive output and failure cleanup. They do not
prove deployed rule/App Check configuration or actual Firebase service behavior.
