/**
 * Read-only integrity audit for the LOCAL FujiX Sync photo archive.
 * Never writes, repairs, deletes, opens a camera, or marks unverified bytes
 * as having come from a Fujifilm device.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {constants as FS_CONSTANTS} from 'node:fs';

const MAX_FILES=1000;
const MAX_TOTAL_BYTES=4*1024*1024*1024;
const MAX_FILE_BYTES=200*1024*1024;
const PHOTO_NAME=/^X100VI-Original-([a-f0-9]{24})-([A-Za-z0-9_.-]{1,85})$/i;
const PREVIEW_NAME=/^X100VI-USB-([a-f0-9]{24})\.jpg$/i;
const IMAGE_EXTENSIONS=new Set(['jpg','jpeg','raf','png','heic','heif','tif','tiff']);
const FORMAT='fujix-photo-archive-audit';
const VERSION=1;
const CANCELLED='Archive audit canceled. No photographs were modified.';

const stableKey=file=>file.kind+':'+file.savedName;
const validId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/i.test(id);
const fileMime=name=>path.extname(name).slice(1).toLowerCase();

function headerValid(head,tail,extension){
 if(['jpg','jpeg'].includes(extension))return head[0]===255&&head[1]===216&&tail.at(-2)===255&&tail.at(-1)===217;
 if(extension==='raf')return head.toString('ascii',0,15)==='FUJIFILMCCD-RAW';
 if(extension==='png')return head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&tail.toString('ascii',tail.length-8,tail.length-4)==='IEND';
 if(['heic','heif'].includes(extension))return head.toString('ascii',4,8)==='ftyp';
 if(['tif','tiff'].includes(extension))return head.subarray(0,4).equals(Buffer.from([73,73,42,0]))||head.subarray(0,4).equals(Buffer.from([77,77,0,42]));
 return false;
}
function requireSafeDirectory(stat){
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe photo archive directory or symlink');
}
function checkCanceled(signal){if(signal?.aborted)throw Error(CANCELLED)}

async function fileEvidence(filename,expected,extension,signal){
 checkCanceled(signal);
 const fd=await fs.open(filename,FS_CONSTANTS.O_RDONLY|(FS_CONSTANTS.O_NOFOLLOW||0));
 try{
  const actual=await fd.stat();
  if(!actual.isFile()||actual.dev!==expected.dev||actual.ino!==expected.ino||actual.size!==expected.size||actual.mtimeMs!==expected.mtimeMs)throw Error('File changed before verification');
  const digest=crypto.createHash('sha256');
  const buffer=Buffer.allocUnsafe(256*1024);
  let position=0,head=Buffer.alloc(0),tail=Buffer.alloc(0);
  while(position<actual.size){
   checkCanceled(signal);
   const {bytesRead}=await fd.read(buffer,0,Math.min(buffer.length,actual.size-position),position);
   if(!bytesRead)throw Error('File became incomplete while reading');
   const chunk=buffer.subarray(0,bytesRead);
   if(head.length<32)head=Buffer.concat([head,chunk]).subarray(0,32);
   tail=Buffer.concat([tail,chunk]).subarray(-16);
   digest.update(chunk);
   position+=bytesRead;
  }
  const after=await fd.stat();
  if(after.size!==actual.size||after.dev!==actual.dev||after.ino!==actual.ino||after.mtimeMs!==actual.mtimeMs)throw Error('File changed during verification');
  return {sha256:digest.digest('hex'),signatureValid:headerValid(head,tail,extension)};
 }finally{await fd.close()}
}

function validateReceipt(receipt){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.format!==FORMAT||receipt.version!==VERSION||!Array.isArray(receipt.files)||receipt.files.length>MAX_FILES)throw Error('Choose a valid FujiX photo archive audit JSON receipt');
 const found=new Set();
 for(const file of receipt.files){
  if(!file||typeof file!=='object'||!['original','usb-preview'].includes(file.kind)||typeof file.savedName!=='string'||file.savedName.length>140||!validId(file.id)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>MAX_FILE_BYTES||typeof file.sha256!=='string'||!['verified','invalid'].includes(file.integrity)||(file.integrity==='verified'&&!/^[a-f0-9]{64}$/i.test(file.sha256))||(file.integrity==='invalid'&&file.sha256!==''&&!/^[a-f0-9]{64}$/i.test(file.sha256)))throw Error('Malformed photo archive audit receipt entry');
  const original=file.kind==='original'?PHOTO_NAME.exec(file.savedName):PREVIEW_NAME.exec(file.savedName);
  if(!original||original[1].toLowerCase()!==file.id.toLowerCase())throw Error('Audit receipt photo identity is invalid');
  const key=stableKey(file);
  if(found.has(key))throw Error('Duplicate photo identity in audit receipt');
  found.add(key);
 }
 return receipt;
}

export function comparePhotoArchiveAudits(baseline,current){
 validateReceipt(baseline);validateReceipt(current);
 if(baseline.truncated||current.truncated)throw Error('Audit comparison requires complete reports. A scan was truncated; no all-clear can be asserted.');
 const before=new Map(baseline.files.map(file=>[stableKey(file),file]));
 const after=new Map(current.files.map(file=>[stableKey(file),file]));
 const missing=[],added=[],changed=[],unchanged=[];
 for(const [key,old] of before){
  const item=after.get(key);
  if(!item)missing.push({kind:old.kind,savedName:old.savedName});
  else if(old.sha256!==item.sha256||old.bytes!==item.bytes||old.integrity!==item.integrity)changed.push({kind:item.kind,savedName:item.savedName,previousBytes:old.bytes,currentBytes:item.bytes});
  else unchanged.push({kind:item.kind,savedName:item.savedName});
 }
 for(const [key,item] of after)if(!before.has(key))added.push({kind:item.kind,savedName:item.savedName});
 return {ok:true,readOnly:true,baselineAt:baseline.completedAt,currentAt:current.completedAt,
  counts:{missing:missing.length,added:added.length,changed:changed.length,unchanged:unchanged.length},
  missing,added,changed,unchanged:unchanged.length,
  note:'Compares local photo bytes with a previously exported audit receipt. Receipt provenance depends on when and where it was originally created; it is not a camera authenticity certificate.'};
}

export class PhotoArchiveAudit {
 constructor({root,maxFiles=MAX_FILES,maxTotalBytes=MAX_TOTAL_BYTES}={}){
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Photo archive root must be an absolute path');
  this.root=path.resolve(root);
  this.maxFiles=Math.min(MAX_FILES,Number.isSafeInteger(maxFiles)&&maxFiles>0?maxFiles:MAX_FILES);
  this.maxTotalBytes=Math.min(MAX_TOTAL_BYTES,Number.isSafeInteger(maxTotalBytes)&&maxTotalBytes>0?maxTotalBytes:MAX_TOTAL_BYTES);
  this.report=null;this.worker=null;this.abort=null;
  this.job={state:'idle',running:false,scanned:0,found:0,bytesScanned:0,startedAt:null,completedAt:null,detail:'No local archive audit run'};
 }
 status(){
  return {...this.job,readOnly:true,source:'local-Mac-photo-archive',cameraConnected:false,
   reportAvailable:!!this.report,summary:this.report?.summary||null};
 }
 async start(){
  if(this.job.running)throw Error('A photo archive audit is already running');
  this.abort=new AbortController();
  this.report=null;
  this.job={state:'scanning',running:true,scanned:0,found:0,bytesScanned:0,startedAt:new Date().toISOString(),completedAt:null,detail:'Verifying files read-only on the local archive'};
  const signal=this.abort.signal;
  this.worker=this.scan(signal).then(report=>{
   this.report=report;
   Object.assign(this.job,{state:'completed',running:false,completedAt:report.completedAt,detail:report.truncated?'Audit limit reached: report is incomplete.':'Archive audit completed; photos unchanged.'});
  }).catch(error=>{
   Object.assign(this.job,{state:signal.aborted?'canceled':'error',running:false,completedAt:new Date().toISOString(),detail:String(error.message||error).slice(0,240)});
  }).finally(()=>{this.abort=null;this.worker=null});
  return this.status();
 }
 cancel(){
  if(!this.job.running||!this.abort)return this.status();
  this.abort.abort();return {...this.status(),cancellationRequested:true};
 }
 exportReport(){
  if(this.job.running||!this.report)throw Error('Complete an archive audit before downloading a receipt');
  return JSON.stringify(this.report,null,2)+'\n';
 }
 compare(receipt){
  if(this.job.running||!this.report)throw Error('Complete a fresh archive audit before comparing receipts');
  return comparePhotoArchiveAudits(receipt,this.report);
 }
 async scan(signal){
  const root=await fs.lstat(this.root);
  requireSafeDirectory(root);
  const entries=[],issues=[],seenDigests=new Map();
  let truncated=false,ignored=0;
  for(const [subfolder,kind] of [['Originals','original'],['Captures','usb-preview']]){
   checkCanceled(signal);
   const dir=path.join(this.root,subfolder);
   let substat;
   try{substat=await fs.lstat(dir)}catch(error){if(error.code==='ENOENT')continue;throw error}
   requireSafeDirectory(substat);
   const names=(await fs.readdir(dir)).sort();
   for(const savedName of names){
    checkCanceled(signal);
    const match=(kind==='original'?PHOTO_NAME:PREVIEW_NAME).exec(savedName);
    if(!match){
     ignored++;
     if(kind==='original'&&/^\.fujix-card-[a-f0-9-]{36}\.part$/i.test(savedName)){
      issues.push({kind,savedName,issue:'Unfinished card-import staging file (not an original photo). No cleanup performed.'});
     }
     continue;
    }
    if(entries.length>=this.maxFiles){truncated=true;break}
    const id=match[1].toLowerCase();
    const extension=fileMime(savedName);
    if(!IMAGE_EXTENSIONS.has(extension)){ignored++;continue}
    const full=path.join(dir,savedName);
    const entry={id,kind,savedName,bytes:0,sha256:'',integrity:'invalid',signatureValid:false,hashPrefixMatches:false};
    entries.push(entry);this.job.found++;
    try{
     const stat=await fs.lstat(full);
     if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Unsafe file, symlink or hard link');
     entry.bytes=stat.size;
     if(stat.size<33||stat.size>MAX_FILE_BYTES)throw Error('Invalid or oversized photo size');
     if(this.job.bytesScanned+stat.size>this.maxTotalBytes){truncated=true;entries.pop();this.job.found--;break}
     const evidence=await fileEvidence(full,stat,extension,signal);
     entry.sha256=evidence.sha256;
     entry.signatureValid=evidence.signatureValid;
     entry.hashPrefixMatches=evidence.sha256.startsWith(id);
     if(!evidence.signatureValid)throw Error('File header or ending does not match its photo format');
     entry.integrity='verified';
     const prior=seenDigests.get(entry.sha256)||[];
     prior.push({kind,savedName});
     seenDigests.set(entry.sha256,prior);
    }catch(error){
     if(signal.aborted)throw Error(CANCELLED);
     entry.issue=String(error.message||error).slice(0,150);
     issues.push({kind,savedName,issue:entry.issue});
    }
    this.job.bytesScanned+=Math.min(entry.bytes,MAX_FILE_BYTES);
    this.job.scanned++;
   }
   if(truncated)break;
  }
  const duplicates=[...seenDigests].filter(([,files])=>files.length>1).map(([sha256,files])=>({sha256,files}));
  const completedAt=new Date().toISOString();
  return {format:FORMAT,version:VERSION,completedAt,truncated,rootLabel:path.basename(this.root),
   source:'local-read-only',files:entries,summary:{scanned:entries.length,valid:entries.filter(x=>x.integrity==='verified').length,issues:issues.length,duplicates:duplicates.length,ignored,bytesRead:this.job.bytesScanned,complete:!truncated},
   issues,duplicates,note:'Basic photo header/trailer checks do not fully decode images. Only locally archived FujiX-named files were checked. File hashes confirm local bytes at audit time, not physical camera origin. Unmatched files were ignored except recognized incomplete staging files. No files were changed.'};
 }
}
