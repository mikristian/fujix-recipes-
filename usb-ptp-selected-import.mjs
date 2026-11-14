/**
 * Explicit, bounded X100VI PTP original importer. Camera files are matched
 * afresh by exact filename + byte size; absent PTP object handles are never
 * trusted. The native helper refuses ambiguous matches, camera writes and
 * deletions. Bytes are SHA-256 checked before and after local archive copy.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {LocalPhotoLibrary} from './local-photo-library.mjs';

const MAX_SELECTED=10,MAX_TOTAL=900*1024*1024,MAX_LOG=48*1024;
const SAFE_NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const VALID_ID=/^[a-f0-9]{32}$/;
const formats=new Set(['JPG','JPEG','RAF']);
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";

export function selectPtpOriginals(catalog,ids,now=Date.now()){
 if(catalog?.state!=='completed'||catalog?.receipt?.complete!==true||
    !Number.isFinite(catalog.completedAt)||now-catalog.completedAt>20*60*1000||
    now<catalog.completedAt)throw Error('Scan the USB camera again: the file catalog is missing or expired.');
 if(!Array.isArray(ids)||!ids.length||ids.length>MAX_SELECTED||
    new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!VALID_ID.test(id)))
   throw Error('Select 1–10 distinct JPEG/RAF files from the current camera catalog.');
 const files=catalog.receipt.files;
 const keys=new Map();
 for(const item of files){
   const key=item.name+'\0'+item.format+'\0'+item.bytes;
   keys.set(key,(keys.get(key)||0)+1);
 }
 let total=0;
 const selected=ids.map(id=>{
   const item=files.find(f=>f.id===id);
   if(!item||!SAFE_NAME.test(item.name)||!formats.has(item.format)||
      !item.name.toUpperCase().endsWith('.'+item.format)||
      !Number.isSafeInteger(item.bytes)||item.bytes<128||
      item.bytes>(item.format==='RAF'?200*1024*1024:64*1024*1024))
     throw Error('Selected camera file is unsafe or unavailable; scan again.');
   if(keys.get(item.name+'\0'+item.format+'\0'+item.bytes)!==1)
     throw Error('Ambiguous camera filename and file size; cannot safely select this photo.');
   total+=item.bytes;
   if(total>MAX_TOTAL)throw Error('Selection exceeds the 900 MB per-job safety limit.');
   return {id:item.id,name:item.name,format:item.format,bytes:item.bytes};
 });
 return selected;
}

export function selectedPtpCommand({binary,filename,bytes,folder,output,log}){
 for(const p of [binary,folder,log]){
   if(typeof p!=='string'||!path.isAbsolute(p)||/[\0\r\n]/.test(p))throw Error('Unsafe native importer path.');
 }
 if(!SAFE_NAME.test(filename)||!SAFE_NAME.test(output)||
    !Number.isSafeInteger(bytes)||bytes<128||bytes>200*1024*1024)
   throw Error('Unsafe selected file or output name.');
 return '#!/bin/sh\n'+[binary,'--copy-selected',filename,String(bytes),folder,output]
    .map(quote).join(' ')+' > '+quote(log)+' 2>&1\n';
}

export function verifyPtpNativeReceipt(log,{output,bytes,format}){
 if(typeof log!=='string'||Buffer.byteLength(log)>MAX_LOG)throw Error('Native transfer log exceeded safe limits.');
 for(const marker of ['X100VI_USB_MATCH: yes','X100VI_MEDIA_CATALOG_COMPLETE: yes',
     'COPY_FRESH_CATALOG_EXACT_MATCH_COUNT: 1','COPY_DELETION_ALLOWED: no',
     'COPY_OVERWRITE_ALLOWED: no','COPY_SUCCESS: yes',
     'COPY_SELECTED_'+(format==='RAF'?'RAF':'JPEG')+'_REQUESTED: yes']){
   if(!log.includes(marker))throw Error('Native file transfer did not prove safe completion.');
 }
 const names=[...log.matchAll(/^COPY_OUTPUT_NAME: ([A-Za-z0-9_.-]+)$/gm)].map(m=>m[1]);
 const size=/^COPY_VERIFIED_LENGTH: (\d+)$/m.exec(log);
 if(names.length!==2||names.some(x=>x!==output)||Number(size?.[1])!==bytes)
   throw Error('Selected camera output name or length changed during transfer.');
 return {output,bytes};
}

export async function hashPtpOriginal(file,size,format){
 const before=await fsp.lstat(file);
 if(!before.isFile()||before.isSymbolicLink()||before.size!==size||before.nlink!==1)
   throw Error('Camera photo copy is missing, incomplete, or linked.');
 const handle=await fsp.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
   const head=Buffer.alloc(16),tail=Buffer.alloc(2);
   await handle.read(head,0,16,0);
   if(format==='RAF'){
     if(head.toString('ascii',0,15)!=='FUJIFILMCCD-RAW')
       throw Error('Camera RAW signature is invalid.');
   }else{
     await handle.read(tail,0,2,size-2);
     if(head[0]!==255||head[1]!==216||tail[0]!==255||tail[1]!==217)
       throw Error('Camera JPEG start/end signature is invalid.');
   }
 }finally{await handle.close()}
 const hash=crypto.createHash('sha256');
 for await(const block of fs.createReadStream(file,{flags:fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)}))
   hash.update(block);
 const after=await fsp.lstat(file);
 if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||
    after.ino!==before.ino||after.dev!==before.dev)
   throw Error('Camera photo copy changed during hashing.');
 return hash.digest('hex');
}

async function launchTerminal(script){
 await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-a','Terminal',script],
   {timeout:15000,maxBuffer:16384},error=>error?reject(error):resolve()));
}
async function safeFolder(dir){
 await fsp.mkdir(dir,{recursive:true,mode:0o700});
 const stat=await fsp.lstat(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||await fsp.realpath(dir)!==dir)
   throw Error('Unsafe camera import staging directory.');
}

export class UsbPtpSelectedImport {
 constructor({root,appRoot,catalog,library,launcher=launchTerminal,clock=()=>Date.now(),
   sleepFn=sleep,platform=process.platform,deadlineMs=180000}={}){
   if(!root||!appRoot||!catalog)throw Error('Camera import requires root, app, and live catalog.');
   this.root=path.resolve(root);
   this.binary=path.join(path.resolve(appRoot),'tools','.bin','x100vi-card-reader-copy-selected');
   this.catalog=catalog;
   this.library=library||new LocalPhotoLibrary({root:this.root,maxItems:2000});
   this.launcher=launcher;this.clock=clock;this.sleep=sleepFn;
   this.platform=platform;this.deadlineMs=deadlineMs;
   this.state='idle';this.startedAt=null;this.completedAt=null;
   this.jobId=null;this.items=[];this.error=null;this.cancelRequested=false;
   this.promise=null;
 }
 status(){
   return {state:this.state,running:this.state==='importing',startedAt:this.startedAt,
     completedAt:this.completedAt,jobId:this.jobId,error:this.error,
     cancelRequested:this.cancelRequested,items:this.items.map(f=>({...f})),
     imported:this.items.filter(f=>f.status==='imported').length,
     duplicates:this.items.filter(f=>f.status==='duplicate').length,
     failed:this.items.filter(f=>f.status==='error').length,
     checksum:'SHA-256',cameraDeletes:false,cameraSettingsChanged:false,maxSelected:MAX_SELECTED};
 }
 async start(ids){
   if(this.state==='importing')throw Error('A camera-original import is already running.');
   if(this.platform!=='darwin')throw Error('Direct camera imports require macOS.');
   const selected=selectPtpOriginals(this.catalog,ids,this.clock());
   const helper=await fsp.lstat(this.binary);
   if(!helper.isFile()||helper.isSymbolicLink()||(helper.mode&0o111)===0)
     throw Error('Native selected-photo importer is missing or not executable.');
   if(await fsp.realpath(this.root)!==this.root)
     throw Error('Camera archive root is not a canonical directory.');
   const base=path.join(this.root,'Projects','USB-Card-Selected-Imports');
   await safeFolder(base);
   const jobId=crypto.randomUUID(),folder=path.join(base,jobId);
   await safeFolder(folder);
   this.state='importing';this.startedAt=this.clock();this.completedAt=null;
   this.jobId=jobId;this.error=null;this.cancelRequested=false;
   this.items=selected.map(x=>({...x,status:'queued',sha256:null,archiveId:null,error:null}));
   this.promise=this.run(folder).catch(error=>{
     this.state='error';this.error=String(error?.message||error).slice(0,240);
     this.completedAt=this.clock();
     const current=this.items.find(i=>['queued','copying','verifying'].includes(i.status));
     if(current){current.status='error';current.error=this.error}
   });
   return this.status();
 }
 cancel(){if(this.state==='importing')this.cancelRequested=true;return this.status()}
 async waitReceipt(log,expected){
   const start=this.clock();
   for(;;){
     const data=await fsp.readFile(log,'utf8');
     if(Buffer.byteLength(data)>MAX_LOG)throw Error('Native camera transfer output exceeded safe limits.');
     const stop=/COPY_STOP: ([^\r\n]{1,175})/.exec(data);
     if(stop)throw Error(stop[1]);
     if(data.includes('COPY_SUCCESS: yes'))return verifyPtpNativeReceipt(data,expected);
     if(this.clock()-start>this.deadlineMs)throw Error('Physical selected-camera transfer timed out.');
     await this.sleep(1000);
   }
 }
 async matchingDuplicate(size,hash,format){
   // Do NOT use library.list() here: that API intentionally returns a
   // limited view (maxItems / first 2000 directory entries). Missing an
   // older archived original would silently create a SHA-identical copy.
   await this.library.prepare();
   const entries=await fsp.readdir(this.library.originals,{withFileTypes:true});
   if(entries.length>100000)
     throw Error('The original-photo archive is too large for a complete duplicate check; import stopped.');
   for(const entry of entries){
     if(!entry.isFile()||entry.isSymbolicLink())continue;
     const match=/^X100VI-Original-([a-f0-9]{24})-.+\.(?:jpg|jpeg|raf|png|tif|tiff|heic|heif)$/i.exec(entry.name);
     if(!match)continue;
     const full=path.join(this.library.originals,entry.name);
     try{
       const stat=await fsp.lstat(full);
       if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size!==size)continue;
       if(await hashPtpOriginal(full,size,format)===hash)return {id:match[1]};
     }catch{}
   }
   return null;
 }
 async run(folder){
   await this.library.prepare();
   for(const item of this.items){
     if(this.cancelRequested){this.state='cancelled';break}
     const output='FujiX-Selected-'+crypto.randomUUID()+'.'+item.format;
     const log=path.join(folder,'copy-'+item.id+'.log');
     const script=path.join(folder,'copy-'+item.id+'.command');
     const staged=path.join(folder,output);
     await fsp.writeFile(log,'',{flag:'wx',mode:0o600});
     await fsp.writeFile(script,selectedPtpCommand({binary:this.binary,
       filename:item.name,bytes:item.bytes,folder,output,log}),{flag:'wx',mode:0o700});
     item.status='copying';
     await this.launcher(script);
     await this.waitReceipt(log,{output,bytes:item.bytes,format:item.format});
     item.status='verifying';
     const hash=await hashPtpOriginal(staged,item.bytes,item.format);
     item.sha256=hash;
     const duplicate=await this.matchingDuplicate(item.bytes,hash,item.format);
     if(duplicate){
       item.status='duplicate';item.archiveId=duplicate.id;
       await fsp.unlink(staged);continue;
     }
     const input=fs.createReadStream(staged,{flags:fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)});
     input.headers={'content-length':String(item.bytes),'content-type':'application/octet-stream'};
     const saved=await this.library.write(input,{kind:'original',filename:item.name});
     const archive=path.join(this.library.originals,saved.savedName);
     try{
       if(await hashPtpOriginal(archive,item.bytes,item.format)!==hash)
         throw Error('Archived camera original checksum differs from downloaded file.');
       item.archiveId=saved.id;item.status='imported';
       await fsp.unlink(staged);
     }catch(error){
       const check=await fsp.lstat(archive).catch(()=>null);
       if(check?.isFile()&&!check.isSymbolicLink())await fsp.unlink(archive).catch(()=>{});
       throw error;
     }
   }
   if(this.state==='importing')this.state='completed';
   this.completedAt=this.clock();
   await fsp.writeFile(path.join(folder,'receipt.json'),JSON.stringify({
     format:'fujix-usb-ptp-selected-import',version:1,jobId:this.jobId,
     state:this.state,items:this.items,startedAt:this.startedAt,
     completedAt:this.completedAt,cameraDeletes:false,checksums:'SHA-256',
   },null,2),{flag:'wx',mode:0o600});
 }
}
