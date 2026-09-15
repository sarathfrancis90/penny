"""Generate PUBLIC DESIGN bytes only. Does not encrypt or produce a valid backup."""
import base64
import hashlib
import hmac
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONTRACT = HERE.parents[1]
CONTEXT = b'PENNY-OFFLINE-BACKUP:4:SECRETSTREAM'
AAD_DOMAIN = b'PENNY-OFFLINE-BACKUP:4:FRAME\0'
ROOT = bytes([7]) * 32
SALT = bytes([9]) * 32
# All-zero placeholder is deliberately NOT an init_push output/authentication claim.
HEADER = b'PNYBKP4\n' + (4).to_bytes(2, 'big') + (1048576).to_bytes(4, 'big') + SALT + bytes(24)
NAMES = ['budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses', 'expenses', 'attachments']

def js(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def record(kind, payload):
    return bytes([kind]) + len(payload).to_bytes(8, 'big') + payload

def logical(name, rows, counts):
    non_receipt = sum(9 + (0 if kind == 10 else len(payload)) for kind, payload in rows)
    receipt = sum(len(payload) for kind, payload in rows if kind == 10)
    begin = dict(schemaVersion=4, capacityProfile='A', snapshotId='22222222-2222-4222-8222-222222222222', vaultId='33333333-3333-4333-8333-333333333333', createdAt='2026-09-13T00:00:00.000Z', counts=counts, receiptBytes=receipt, nonReceiptBytes=non_receipt)
    prefix = record(1, js(begin)) + b''.join(record(k, p) for k, p in rows)
    end = dict(snapshotId=begin['snapshotId'], counts=counts, receiptBytes=receipt, nonReceiptBytes=non_receipt, recordCount=1 + len(rows), streamSha256=hashlib.sha256(prefix).hexdigest())
    stream = prefix + record(11, js(end))
    return dict(name=name, status='unencrypted logical layout; not a backup', begin=begin, end=end, logicalHex=stream.hex(), logicalByteCount=len(stream), actualNonReceiptBytes=len(stream)-receipt, logicalSha256=hashlib.sha256(stream).hexdigest())

expense = json.loads((CONTRACT/'fixtures/expense-valid.json').read_text())
expense.update(description='', recurringTemplateId=None, recurringOccurrenceDate=None)
attachment = json.loads((CONTRACT/'fixtures/attachment-valid.json').read_text())
raw = base64.b64decode(attachment.pop('dataBase64'), validate=True)
assert attachment['expenseId'] == expense['id']
assert attachment['sha256'] == hashlib.sha256(raw).hexdigest()
counts = dict.fromkeys(NAMES, 0)
empty = logical('empty', [], counts)
one_counts = {**counts, 'expenses':1, 'attachments':1}
one = logical('one-expense-one-receipt', [(8,js(expense)),(9,js(attachment)),(10,raw)], one_counts)
prk = hmac.new(SALT,ROOT,hashlib.sha256).digest()
key = hmac.new(prk,CONTEXT+b'\x01',hashlib.sha256).digest()
assert key.hex() == '963f13ce21c002e078db22b690aeec9431005254c560627ccab302dadba0caf9'
frames = []
for sequence, plaintext_bytes in [(0,len(bytes.fromhex(empty['logicalHex']))),(0,1048576),(639,1048576)]:
    wire_header = sequence.to_bytes(8,'big')+(plaintext_bytes+17).to_bytes(8,'big')
    allowed_tags = [3] if plaintext_bytes < 1048576 or sequence == 639 else [0, 3]
    frames.append(dict(sequence=sequence, allowedAuthenticatedTagValues=allowed_tags, plaintextByteCount=plaintext_bytes, ciphertextByteCount=plaintext_bytes+17, frameHeaderHex=wire_header.hex(), aadHex=(AAD_DOMAIN+HEADER+wire_header).hex()))
result = dict(status='DRAFT DESIGN VECTORS; no secretstream ciphertext', header=dict(byteCount=len(HEADER),hex=HEADER.hex(),secretstreamHeaderIsPlaceholder=True), keyDerivation=dict(rootHex=ROOT.hex(),saltHex=SALT.hex(),contextUtf8=CONTEXT.decode(),contextByteCount=len(CONTEXT),contextHex=CONTEXT.hex(),prkHex=prk.hex(),keyHex=key.hex(),provenance='Expected key also matched pinned libsodium 1.0.22 Swift/JNI feasibility probes; this generator uses stdlib HMAC.'), aadDomain=dict(byteCount=len(AAD_DOMAIN),hex=AAD_DOMAIN.hex()), frames=frames, records=[empty,one])
assert len(HEADER)==70
(HERE/'layout-vectors.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'headerBytes':len(HEADER),'contextBytes':len(CONTEXT),'aadDomainBytes':len(AAD_DOMAIN),'emptyLogicalBytes':empty['logicalByteCount'],'receiptLogicalBytes':one['logicalByteCount']}))
