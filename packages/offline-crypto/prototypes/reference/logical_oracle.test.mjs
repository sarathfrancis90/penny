import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LogicalOracle,strictObject,CHUNK } from './logical_oracle.mjs';
import { buildCase,verifyBytes,sha,output,root,pack,record,corpus } from './logical_fixtures.mjs';
const manifest=JSON.parse(readFileSync(new URL('fixture-manifest.json',output)));
test('all published logical positives and negatives have exact reproducible bytes and outcomes',()=>{
  assert.equal(JSON.stringify(corpus(),null,2)+'\n',readFileSync(new URL('fixture-manifest.json',output),'utf8'));
  for(const c of [...manifest.positives,...manifest.negatives]){
    if(c.expected==='accept'&&c.recipe.op==='base')assert.equal(sha(readFileSync(new URL(c.file,output))),c.plaintextSha256);
    const bytes=buildCase(c.recipe);assert.equal(bytes.length,c.plaintextBytes,c.name);assert.equal(sha(bytes),c.plaintextSha256,c.name);
    if(c.expected==='accept')assert.deepEqual(verifyBytes(bytes,c.finalFrame),c.summary,c.name);
    else assert.throws(()=>verifyBytes(bytes,c.finalFrame),{message:c.expectedError},c.name);
  }
});
test('split fixtures straddle actual 1MiB record and END boundaries',()=>{
  for(const [name,kind,offset] of [['split-domain-header',8,CHUNK-4],['split-end-header',11,CHUNK-4],['split-end-payload',11,CHUNK-20]]){
    const bytes=buildCase(manifest.positives.find(c=>c.name===name).recipe);let at=0;const positions=[];
    while(at<bytes.length){positions.push([at,bytes[at]]);at+=9+Number(bytes.readBigUInt64BE(at+1));}
    assert(positions.some(([position,type])=>position===offset&&type===kind),name);assert.equal(at,bytes.length);assert.equal(verifyBytes(bytes).frames,2);
  }
});
test('summary separates body declaration from policy metadata and preserves manifest identity',()=>{
  const bytes=buildCase({op:'base',base:'empty'}),summary=verifyBytes(bytes);
  assert.equal(summary.nonReceiptBytes,0);assert.equal(summary.policyMetadataBytes,716);assert.equal(summary.recordCount,2);
  assert.equal(summary.vaultId,'33333333-3333-4333-8333-333333333333');assert.equal(summary.createdAt,'2026-09-13T00:00:00.000Z');
  assert.equal(verifyBytes(buildCase({op:'many-expenses',amount:1})).counts.expenses,10001);
});
test('exact integer lexemes cannot hide underflow/fractional rounding, zero exponents do not allocate powers',()=>{
  for(const token of ['1.0','1e0','-0','0e99999999999999999999','0e-99999999999999999999'])assert.doesNotThrow(()=>strictObject(Buffer.from('{"n":'+token+'}')));
  for(const token of ['1.0000000000000001','1e-10000','1e99999','9007199254740993'])assert.throws(()=>strictObject(Buffer.from('{"n":'+token+'}')),{message:'inexact_integer'});
  assert.throws(()=>strictObject(Buffer.from('{"id":1,"\\u0069d":2}')),{message:'duplicate_json_member'});
});
test('oversized record declarations reject before allocating body or accepting input',()=>{
  for(const recipe of [{op:'header',kind:1,length:'65537'},{op:'header',kind:1,length:'18446744073709551615'}]){
    const p=new LogicalOracle();assert.throws(()=>p.acceptFrame(buildCase(recipe),true),{message:'record_length'});assert.equal(p.record,null);assert.throws(()=>p.finish(true));
  }
});
test('missing EOF and later failure permanently prevent completion or reuse',()=>{
  const p=new LogicalOracle();p.acceptFrame(buildCase({op:'base',base:'empty'}),true);assert.throws(()=>p.finish(false));assert.throws(()=>p.finish(true));
  const q=new LogicalOracle(),bytes=buildCase({op:'split',boundary:'end-header'});q.acceptFrame(bytes.subarray(0,CHUNK),false);assert.throws(()=>q.finish(true));assert.throws(()=>q.acceptFrame(bytes.subarray(CHUNK),true));
  const r=new LogicalOracle();r.acceptFrame(buildCase({op:'base',base:'empty'}),true);r.finish(true);assert.throws(()=>r.finish(true));
});
test('typed UUID identity reuse across domains is allowed without weakening ownership',()=>{
  const source=JSON.parse(readFileSync(new URL('snapshot-v3.json',root)));source.budgets[0].id=source.incomeSources[0].id;
  const rows=[];['budgets','incomeSources','incomeEntries','savingsGoals','savingsEntries','recurringExpenses','expenses'].forEach((name,i)=>source[name].forEach(value=>rows.push({kind:i+2,value})));
  assert.equal(verifyBytes(pack(rows)).counts.expenses,3);
});
test('raw bytes without descriptor and truncated BEGIN payload never become a partial summary',()=>{
  assert.throws(()=>verifyBytes(record(10,Buffer.from([1]))),{message:'begin_required'});
  const bytes=buildCase({op:'base',base:'empty'});assert.throws(()=>verifyBytes(bytes.subarray(0,100)),{message:'incomplete_logical'});
});
