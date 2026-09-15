// Reproducible PUBLIC logical fixtures; no encryption or production archive writer.
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { LogicalOracle,names,CHUNK,need } from './logical_oracle.mjs';
export const root=new URL('../../../offline-contract/fixtures/',import.meta.url);
export const output=new URL('v4-logical/',root);
const source=JSON.parse(readFileSync(new URL('snapshot-v3.json',root)));
const clone=x=>structuredClone(x),json=x=>Buffer.from(JSON.stringify(x));
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function record(kind,payload){const h=Buffer.alloc(9);h[0]=kind;h.writeBigUInt64BE(BigInt(payload.length),1);return Buffer.concat([h,payload]);}
function rows(){const result=[];names.slice(0,7).forEach((name,i)=>source[name].forEach(x=>result.push({kind:i+2,value:clone(x)})));for(const x of source.attachments){const {dataBase64,...descriptor}=x;result.push({kind:9,value:descriptor},{kind:10,payload:Buffer.from(dataBase64,'base64')});}return result;}
export function pack(input,{beginPatch={},endPatch={}}={}){
  const encoded=input.map(r=>({kind:r.kind,payload:r.payload??json(r.value)}));
  const counts=Object.fromEntries(names.map((n,i)=>[n,encoded.filter(r=>r.kind===i+2).length]));
  const receiptBytes=encoded.filter(r=>r.kind===10).reduce((n,r)=>n+r.payload.length,0);
  const nonReceiptBytes=encoded.reduce((n,r)=>n+9+(r.kind===10?0:r.payload.length),0);
  const begin={schemaVersion:4,capacityProfile:'A',snapshotId:source.snapshotId,vaultId:source.vaultId,createdAt:source.createdAt,counts,receiptBytes,nonReceiptBytes,...beginPatch};
  const prefix=Buffer.concat([record(1,json(begin)),...encoded.map(r=>record(r.kind,r.payload))]);
  const end={snapshotId:begin.snapshotId,counts,receiptBytes,nonReceiptBytes,recordCount:1+encoded.length,streamSha256:sha(prefix),...endPatch};
  return Buffer.concat([prefix,record(11,json(end))]);
}
function padded(split){
  const rs=Array.from({length:17},(_,i)=>({kind:8,value:{...clone(source.expenses[0]),id:(i+1).toString(16).padStart(8,'0')+'-0000-0000-0000-000000000000'}}));
  const target=CHUNK-(split==='end-payload'?20:4),index=split==='domain-header'?16:17;
  for(const r of rs)r.payload=json(r.value);
  for(let attempt=0;attempt<4;attempt++){
    const data=pack(rs);let position=9+Number(data.readBigUInt64BE(1));for(let i=0;i<index;i++)position+=9+rs[i].payload.length;
    let delta=target-position;
    if(delta===0)return data;
    if(delta<0){const row=rs.find(r=>r.payload.length>json(r.value).length-delta);need(row,'padding_overshoot');row.payload=row.payload.subarray(0,row.payload.length+delta);continue;}
    for(let i=0;i<index&&delta;i++){const n=Math.min(delta,65536-rs[i].payload.length);rs[i].payload=Buffer.concat([rs[i].payload,Buffer.alloc(n,32)]);delta-=n;}
    need(delta===0,'padding_capacity');
  }
  throw new Error('padding_failed');
}
const layouts=JSON.parse(readFileSync(new URL('v4-design/layout-vectors.json',root)));
const bases={empty:Buffer.from(layouts.records[0].logicalHex,'hex'),receipt:Buffer.from(layouts.records[1].logicalHex,'hex'),finance:pack(rows())};
export function buildCase(recipe){
  if(recipe.op==='base')return bases[recipe.base];
  if(recipe.op==='split')return padded(recipe.boundary);
  if(recipe.op==='many-expenses')return pack(Array.from({length:10001},(_,i)=>({kind:8,value:{...clone(source.expenses[0]),id:(i+1).toString(16).padStart(8,'0')+'-0000-0000-0000-000000000000',amountMinor:recipe.amount}})));
  if(recipe.op==='duplicate-expense-occurrence'){const rs=rows();for(const r of rs.filter(r=>r.kind===8).slice(0,2)){r.value.recurringTemplateId=source.recurringExpenses[0].id;r.value.recurringOccurrenceDate='2026-02-28';}return pack(rs);}
  if(recipe.op==='truncate')return bases[recipe.base].subarray(0,recipe.bytes??bases[recipe.base].length-1);
  if(recipe.op==='append')return Buffer.concat([bases[recipe.base],Buffer.from(recipe.hex,'hex')]);
  if(recipe.op==='end-message')return Buffer.concat([bases.empty,Buffer.alloc(CHUNK-bases.empty.length)]);
  if(recipe.op==='header')return Buffer.concat([Buffer.from([recipe.kind]),Buffer.from(BigInt(recipe.length).toString(16).padStart(16,'0'),'hex')]);
  let rs=rows();
  const selected=()=>rs.findIndex(r=>r.kind===recipe.kind);
  if(recipe.op==='begin')return pack(rs,{beginPatch:recipe.patch});
  if(recipe.op==='end')return pack(rs,{endPatch:recipe.patch});
  if(recipe.op==='set'){const i=selected();rs[i].value={...rs[i].value,...recipe.patch};}
  else if(recipe.op==='raw-json')rs[selected()].payload=Buffer.from(recipe.hex,'hex');
  else if(recipe.op==='duplicate'){const i=selected();const extra=clone(rs[i]);if(recipe.newId)extra.value.id=recipe.newId;rs.splice(i+1,0,extra);}
  else if(recipe.op==='swap'){[rs[recipe.a],rs[recipe.b]]=[rs[recipe.b],rs[recipe.a]];}
  else if(recipe.op==='remove')rs=rs.filter((r,i)=>i!==selected());
  else if(recipe.op==='raw-flip'){const r=rs.find(r=>r.kind===10);r.payload=Buffer.from(r.payload);r.payload[recipe.offset]^=1;}
  else throw new Error('unknown_recipe');
  return pack(rs);
}
export function verifyBytes(bytes,final=true){const parser=new LogicalOracle();for(let at=0;at<bytes.length;at+=CHUNK)parser.acceptFrame(bytes.subarray(at,at+CHUNK),final&&at+CHUNK>=bytes.length);return parser.finish(true);}
export function corpus(){
  const positives=[['empty',{op:'base',base:'empty'}],['one-receipt',{op:'base',base:'receipt'}],['finance',{op:'base',base:'finance'}],['split-domain-header',{op:'split',boundary:'domain-header'}],['split-end-header',{op:'split',boundary:'end-header'}],['split-end-payload',{op:'split',boundary:'end-payload'}]].map(([name,recipe])=>({name,recipe,layer:'semantic',expected:'accept'}));
  positives.push({name:'beyond-legacy-count',recipe:{op:'many-expenses',amount:1},layer:'semantic',expected:'accept'});
  const budget=json(source.budgets[0]).toString();
  for(const [name,value] of [['exact-integer-forms',budget.replace('10000','1e0').replace('5000','1.0')],['negative-zero',budget.replace('10000','-0')],['zero-huge-exponents',budget.replace('10000','0e99999999999999999999').replace('5000','0e-99999999999999999999')]])positives.push({name,recipe:{op:'raw-json',kind:2,hex:Buffer.from(value).toString('hex')},layer:'structural',expected:'accept'});
  const negatives=[];const add=(name,layer,recipe,extra={})=>negatives.push({name,layer,recipe,expected:'reject',...extra});
  for(const [name,number] of [['tiny-fraction','1e-10000'],['rounded-integer','1.0000000000000001']])add(name,'structural',{op:'raw-json',kind:2,hex:Buffer.from(budget.replace('10000',number)).toString('hex')});
  add('missing-begin','structural',{op:'header',kind:11,length:'1'});
  add('unknown-kind','structural',{op:'header',kind:12,length:'1'});
  add('oversized-json-declaration','structural',{op:'header',kind:1,length:'65537'});
  add('unsigned-record-length','structural',{op:'header',kind:1,length:'18446744073709551615'});
  add('truncated-record-header','structural',{op:'truncate',base:'empty',bytes:8});
  add('truncated-end','structural',{op:'truncate',base:'finance'});
  add('trailing-whitespace','structural',{op:'append',base:'empty',hex:'20'});
  add('end-in-message','structural',{op:'end-message'},{finalFrame:false});
  for(const [name,patch] of [['wrong-profile',{capacityProfile:'B'}],['wrong-schema',{schemaVersion:3}],['unknown-begin-field',{extra:0}],['boolean-count',{receiptBytes:false}],['string-count',{receiptBytes:'70'}],['negative-count',{receiptBytes:-1}],['over-receipt-budget',{receiptBytes:536870913}],['over-metadata-budget',{nonReceiptBytes:134217729}],['under-body-count',{nonReceiptBytes:0}],['under-receipt-count',{receiptBytes:0}]])add(name,'structural',{op:'begin',patch});
  const countMap=Object.fromEntries(names.map(n=>[n,0]));add('over-expense-count','structural',{op:'begin',patch:{counts:{...countMap,expenses:50001}}});add('missing-count-key','structural',{op:'begin',patch:{counts:{expenses:0}}});
  for(const [name,patch] of [['end-snapshot',{snapshotId:'00000000-0000-0000-0000-000000000000'}],['end-counts',{counts:countMap}],['end-receipt-count',{receiptBytes:0}],['end-body-count',{nonReceiptBytes:0}],['end-record-count',{recordCount:0}],['end-transcript',{streamSha256:'0'.repeat(64)}],['end-extra-field',{extra:0}]])add(name,'structural',{op:'end',patch});
  add('domain-order','structural',{op:'swap',a:0,b:2});add('id-order','structural',{op:'swap',a:0,b:1});add('duplicate-domain-id','structural',{op:'duplicate',kind:2});
  add('dangling-descriptor','structural',{op:'remove',kind:10});add('unpaired-raw','structural',{op:'remove',kind:9});add('receipt-length','structural',{op:'set',kind:9,patch:{byteCount:71}});add('receipt-digest','structural',{op:'raw-flip',offset:40});
  const alien='00000000-0000-0000-0000-000000000000';
  for(const [name,kind,patch] of [['orphan-receipt',9,{expenseId:alien}],['receipt-path',9,{path:'../x'}],['orphan-income',4,{sourceId:alien}],['orphan-savings',6,{goalId:alien}],['orphan-recurring',8,{recurringTemplateId:alien,recurringOccurrenceDate:'2026-02-28'}],['linked-null',8,{recurringTemplateId:alien}],['expense-money',8,{amountMinor:100000000000}],['expense-date',8,{expenseDate:'2026-02-30'}],['unknown-expense',8,{extra:0}],['income-boolean',3,{taxable:1}],['invalid-schedule',3,{schedule:{frequency:'weekly',startDate:'2026-01-01',endDate:null,dayOfMonth:2}}]])add(name,'semantic',{op:'set',kind,patch});
  add('expense-aggregate-overflow','semantic',{op:'many-expenses',amount:99999999999});
  add('duplicate-expense-occurrence','semantic',{op:'duplicate-expense-occurrence'});
  add('duplicate-budget-period','semantic',{op:'duplicate',kind:2,newId:'dddddddd-dddd-4ddd-8ddd-ddddddddddde'});
  add('duplicate-income-occurrence','semantic',{op:'duplicate',kind:4,newId:'77777777-7777-4777-8777-777777777778'});
  const expense=json(source.expenses[0]).toString();
  const malformed=[['duplicate-key',expense.replace('{','{"id":"'+source.expenses[0].id+'",')],['escaped-equivalent-key',expense.replace('{','{"\\u0069d":"'+source.expenses[0].id+'",')],['fraction-rounded',expense.replace('6000','6000.0000000000000001')],['overflow-exponent',expense.replace('6000','1e9999')],['invalid-number',expense.replace('6000','06000')],['unpaired-scalar',expense.replace('Original separate note','\\ud800')],['excess-depth','{"x":'+ '['.repeat(33)+'0'+']'.repeat(33)+'}']];
  for(const [name,value] of malformed)add(name,'structural',{op:'raw-json',kind:8,hex:Buffer.from(value).toString('hex')});
  add('json-bom','structural',{op:'raw-json',kind:8,hex:'efbbbf'+Buffer.from(expense).toString('hex')});
  add('invalid-utf8','structural',{op:'raw-json',kind:8,hex:'7b22ff223a307d'});
  for(const c of [...positives,...negatives]){
    const bytes=buildCase(c.recipe);Object.assign(c,{file:c.name+'.pennylogical',plaintextBytes:bytes.length,plaintextSha256:sha(bytes),frameSizes:Array.from({length:Math.ceil(bytes.length/CHUNK)},(_,i)=>Math.min(CHUNK,bytes.length-i*CHUNK)),finalFrame:c.finalFrame??true});
    let failure;try{c.summary=verifyBytes(bytes,c.finalFrame);}catch(error){failure=error;}
    if(c.expected==='accept'){if(failure)throw new Error(c.name+': '+failure.message);}
    else{need(failure,'invalid_fixture_accepted:'+c.name);c.expectedError=failure.message;}
  }
  return {schemaVersion:1,scope:'PUBLIC unencrypted logical streams; no authentication/restore; native full image decode required separately',positives,negatives};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const command=process.argv[2],manifest=corpus(),text=JSON.stringify(manifest,null,2)+'\n';
  need(['generate','verify','materialize'].includes(command),'command');
  if(command==='generate'){mkdirSync(output,{recursive:true});writeFileSync(new URL('fixture-manifest.json',output),text);for(const c of manifest.positives.filter(c=>c.recipe.op==='base'))writeFileSync(new URL(c.file,output),buildCase(c.recipe));}
  else{need(readFileSync(new URL('fixture-manifest.json',output),'utf8')===text,'manifest_drift');for(const c of manifest.positives.filter(c=>c.recipe.op==='base'))need(sha(readFileSync(new URL(c.file,output)))===c.plaintextSha256,'fixture_drift');}
  if(command==='materialize'){const target=resolve(process.argv[3]);need(!existsSync(target),'new_directory_required');mkdirSync(target,{recursive:true});for(const c of [...manifest.positives,...manifest.negatives])writeFileSync(resolve(target,c.file),buildCase(c.recipe));writeFileSync(resolve(target,'fixture-manifest.json'),text);}
  console.log(JSON.stringify({positives:manifest.positives.length,negatives:manifest.negatives.length,reproducible:true}));
}
