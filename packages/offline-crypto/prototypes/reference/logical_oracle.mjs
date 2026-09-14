// Experimental public-fixture oracle. Frame authentication/restore are NOT implemented here.
import { createHash } from 'node:crypto';
import { openSync, closeSync, readSync, fstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseStrictJSON, exactKeys, validTimestamp, validateImageHeader, limits } from '../../../offline-contract/contract.mjs';
import * as finance from '../../../offline-contract/finance.mjs';
export const names = ['budgets','incomeSources','incomeEntries','savingsGoals','savingsEntries','recurringExpenses','expenses','attachments'];
export const maxima = [1200,1000,10000,1000,10000,1000,50000,5000];
export const CHUNK=1048576, MAX_META=134217728, MAX_RAW=536870912, MAX_PLAIN=671088640;
const validators=[finance.validateBudget,finance.validateIncomeSource,finance.validateIncomeEntry,finance.validateSavingsGoal,finance.validateSavingsEntry,finance.validateRecurringExpense,finance.validateFinanceExpense];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function need(ok,code){if(!ok)throw new Error(code);}
const integer=(x,max)=>need(Number.isSafeInteger(x)&&x>=0&&x<=max,'invalid_integer');
const id=x=>need(typeof x==='string'&&uuid.test(x),'invalid_uuid');
function counts(x){exactKeys(x,names);names.forEach((n,i)=>integer(x[n],maxima[i]));}
function equalCounts(a,b){need(names.every(n=>a[n]===b[n]),'count_mismatch');}
export function strictObject(bytes){
  need(bytes.length>0&&bytes.length<=65536,'json_size');
  need(!bytes.subarray(0,3).equals(Buffer.from([239,187,191])),'json_bom');
  const value=parseStrictJSON(bytes,65536);
  need(value!==null&&typeof value==='object'&&!Array.isArray(value),'object_required');
  // Preserve schema3 exact-integer semantics before Number rounding can erase a fraction.
  // Strings are skipped as complete JSON tokens; syntax/UTF8/duplicates/depth were checked above.
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  for(const match of text.matchAll(/"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)){
    if(!match[1])continue;
    const token=match[1];need(Number.isSafeInteger(Number(token)),'inexact_integer');
    const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    let digits=(m[2]+(m[3]??'')).replace(/^0+/,'');
    if(!digits)continue;
    let exponent=Number(m[4]??0)-(m[3]?.length??0);
    while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}
    need(Number.isSafeInteger(exponent)&&exponent>=0&&digits.length+exponent<=16,'inexact_integer');
    need(BigInt(Number(token))===(m[1]?-1n:1n)*BigInt(digits)*10n**BigInt(exponent),'inexact_integer');
  }
  return value;
}
export class LogicalOracle {
  constructor(){
    this.header=Buffer.alloc(9);this.headerAt=0;this.remaining=0;this.record=null;
    this.begin=null;this.ended=false;this.finalSeen=false;this.failed=false;this.phase=1;
    this.observed=Object.fromEntries(names.map(n=>[n,0]));this.last=Array(8).fill(null);
    this.ids=names.map(()=>new Set());this.budgets=new Set();this.incomeOccurrences=new Set();this.expenseOccurrences=new Set();
    this.sums={expense:0,income:0,savings:0};this.meta=0;this.raw=0;this.body=0;this.records=0;this.plain=0;this.frames=0;
    this.transcript=createHash('sha256');this.pending=null;
  }
  addMoney(domain,value){this.sums[domain]+=value;integer(this.sums[domain],limits.totalMinor);}
  startRecord(){
    const kind=this.header[0],big=this.header.readBigUInt64BE(1);
    need(big<=BigInt(Number.MAX_SAFE_INTEGER),'record_length');
    const length=Number(big);need(kind>=1&&kind<=11,'record_kind');
    need(length>0&&length<=(kind===10?2097152:65536),'record_length');
    need(!this.ended,'after_end');
    if(!this.begin)need(kind===1,'begin_required');
    else if(this.pending)need(kind===10,'receipt_pair_required');
    else need(kind!==1&&kind!==10,'record_order');
    if(this.begin&&kind>=2&&kind<=9)need(kind>=this.phase,'record_order');
    if(kind===10){need(length===this.pending.byteCount,'receipt_length');this.raw+=length;need(this.raw<=MAX_RAW&&this.raw<=this.begin.receiptBytes,'receipt_total');}
    this.meta+=9+(kind===10?0:length);need(this.meta<=MAX_META,'metadata_limit');
    if(this.begin&&kind!==11){this.body+=9+(kind===10?0:length);need(this.body<=this.begin.nonReceiptBytes,'body_bytes');}
    if(kind!==11)this.transcript.update(this.header);
    this.record={kind,length,payload:Buffer.alloc(length),at:0,hash:kind===10?createHash('sha256'):null};
    this.remaining=length;
  }
  admitDomain(kind,value){
    const i=kind-2,n=names[i];
    if(kind<=8)validators[i](value);
    else {
      exactKeys(value,['id','expenseId','mediaType','byteCount','sha256']);id(value.id);id(value.expenseId);
      need(['image/png','image/jpeg'].includes(value.mediaType),'unsupported_media');integer(value.byteCount,2097152);need(value.byteCount>0,'attachment_size');
      need(typeof value.sha256==='string'&&/^[0-9a-f]{64}$/.test(value.sha256),'attachment_digest');
      need(this.ids[6].has(value.expenseId),'orphan_attachment');this.pending=value;
    }
    need(this.last[i]===null||this.last[i]<value.id,'id_order');this.last[i]=value.id;
    this.observed[n]++;need(this.observed[n]<=this.begin.counts[n]&&this.observed[n]<=maxima[i],'count_exceeded');this.ids[i].add(value.id);this.phase=kind;
    if(kind===2){const key=value.category+'/'+value.month;need(!this.budgets.has(key),'duplicate_budget_period');this.budgets.add(key);}
    if(kind===4){need(this.ids[1].has(value.sourceId),'orphan_income');this.addMoney('income',value.amountMinor);if(value.occurrenceDate!==null){const key=value.sourceId+'/'+value.occurrenceDate;need(!this.incomeOccurrences.has(key),'duplicate_income_occurrence');this.incomeOccurrences.add(key);}}
    if(kind===5)this.addMoney('savings',value.openingMinor);
    if(kind===6){need(this.ids[3].has(value.goalId),'orphan_savings');this.addMoney('savings',value.amountMinor);}
    if(kind===8){this.addMoney('expense',value.amountMinor);if(value.recurringTemplateId!==null){need(this.ids[5].has(value.recurringTemplateId),'orphan_recurring_expense');const key=value.recurringTemplateId+'/'+value.recurringOccurrenceDate;need(!this.expenseOccurrences.has(key),'duplicate_expense_occurrence');this.expenseOccurrences.add(key);}}
  }
  completeRecord(final,atEnd){
    const {kind,payload,hash}=this.record;
    if(kind===10){need(hash.digest('hex')===this.pending.sha256,'attachment_digest');validateImageHeader(payload,this.pending.mediaType);this.pending=null;}
    else {
      const value=strictObject(payload);
      if(kind===1){
        exactKeys(value,['schemaVersion','capacityProfile','snapshotId','vaultId','createdAt','counts','receiptBytes','nonReceiptBytes']);
        need(value.schemaVersion===4&&value.capacityProfile==='A','unsupported_profile');id(value.snapshotId);id(value.vaultId);need(validTimestamp(value.createdAt),'invalid_timestamp');
        counts(value.counts);integer(value.receiptBytes,MAX_RAW);integer(value.nonReceiptBytes,MAX_META);this.begin=value;
      }else if(kind===11){
        exactKeys(value,['snapshotId','counts','receiptBytes','nonReceiptBytes','recordCount','streamSha256']);counts(value.counts);
        need(value.snapshotId===this.begin.snapshotId,'snapshot_mismatch');equalCounts(value.counts,this.begin.counts);equalCounts(value.counts,this.observed);
        integer(value.receiptBytes,MAX_RAW);integer(value.nonReceiptBytes,MAX_META);integer(value.recordCount,84201);
        need(value.receiptBytes===this.raw&&value.receiptBytes===this.begin.receiptBytes,'receipt_total');
        need(value.nonReceiptBytes===this.body&&value.nonReceiptBytes===this.begin.nonReceiptBytes,'body_bytes');
        need(value.recordCount===this.records,'record_count');
        need(typeof value.streamSha256==='string'&&/^[0-9a-f]{64}$/.test(value.streamSha256)&&value.streamSha256===this.transcript.copy().digest('hex'),'transcript');
        need(final,'end_not_final');need(atEnd,'after_end');this.ended=true;
      }else this.admitDomain(kind,value);
    }
    this.records++;need(this.records<=84202,'record_count');this.record=null;this.headerAt=0;
  }
  acceptFrame(bytes,final){
    try{
      need(!this.failed&&!this.finalSeen,'closed');need(Buffer.isBuffer(bytes)&&typeof final==='boolean','frame_input');
      need(bytes.length>0&&bytes.length<=CHUNK&&(final||bytes.length===CHUNK),'frame_shape');
      this.frames++;need(this.frames<=640,'frame_limit');this.plain+=bytes.length;need(this.plain<=MAX_PLAIN,'plaintext_limit');
      let at=0;
      while(at<bytes.length){
        if(!this.record){const n=Math.min(9-this.headerAt,bytes.length-at);bytes.copy(this.header,this.headerAt,at,at+n);at+=n;this.headerAt+=n;if(this.headerAt!==9)continue;this.startRecord();}
        const n=Math.min(this.remaining,bytes.length-at),part=bytes.subarray(at,at+n),r=this.record;
        if(r.kind!==11)this.transcript.update(part);r.hash?.update(part);part.copy(r.payload,r.at);r.at+=n;this.remaining-=n;at+=n;
        if(this.remaining===0)this.completeRecord(final,at===bytes.length);
      }
      if(final){need(this.ended&&!this.record&&this.headerAt===0&&!this.pending,'incomplete_logical');this.finalSeen=true;}
    }catch(error){this.failed=true;this.record=null;this.pending=null;throw error;}
  }
  finish(eof){
    if(this.failed||this.finished||!this.finalSeen||!this.ended||eof!==true){this.failed=true;throw new Error('incomplete_logical');}this.finished=true;
    return {scope:'logical syntax/schema3 semantics/transcript; image structure only; no crypto/native decode/restore',snapshotId:this.begin.snapshotId,vaultId:this.begin.vaultId,createdAt:this.begin.createdAt,counts:this.observed,recordCount:this.records,plaintextBytes:this.plain,nonReceiptBytes:this.body,policyMetadataBytes:this.meta,receiptBytes:this.raw,frames:this.frames};
  }
}
export function verifyFile(path,{final=true}={}){
  const fd=openSync(path,'r');try{
    const size=fstatSync(fd).size;need(size>0&&size<=MAX_PLAIN,'plaintext_limit');const parser=new LogicalOracle();const frame=Buffer.alloc(CHUNK);let consumed=0;
    while(consumed<size){const desired=Math.min(CHUNK,size-consumed);let n=0;while(n<desired){const count=readSync(fd,frame,n,desired-n,null);need(count>0,'truncated_input');n+=count;}consumed+=n;parser.acceptFrame(frame.subarray(0,n),final&&consumed===size);}
    need(readSync(fd,frame,0,1,null)===0,'trailing_input');return parser.finish(true);
  }finally{closeSync(fd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){console.log(JSON.stringify(verifyFile(process.argv[2])));}
