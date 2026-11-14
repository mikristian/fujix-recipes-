/**
 * Native X100VI PTP card catalog bridged to a macOS graphical Terminal.
 *
 * This does not download, mutate, or delete camera photos. On an Intel Jarvis
 * Mac, ImageCaptureCore discovery can fail in an SSH shell but succeeds in
 * a logged-in graphical Terminal session. The only launched native operation
 * is the compiled, read-only --read-only listing tool.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';

const MAX_BYTES=384*1024;
const MAX_ITEMS=2000;
const MAX_FILE_BYTES=200*1024*1024;
const VALID_NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const SUPPORTED=new Set(['JPG','JPEG','RAF']);
const LAST_LINE='CARD_DOWNLOAD_ATTEMPTED: no';
const TIMEOUT_MS=55000;

export function parsePtpCardCatalog(log){
 if(typeof log!=='string'||Buffer.byteLength(log)>MAX_BYTES)throw Error('Camera catalog output exceeds the safe limit.');
 const progress=/^CARD_CATALOG_PROGRESS: (\d+)$/m.exec(log);
 const count=/^CARD_FILE_COUNT: (\d+)$/m.exec(log);
 const jpg=/^CARD_JPEG_COUNT: (\d+)$/m.exec(log);
 const raf=/^CARD_RAF_COUNT: (\d+)$/m.exec(log);
 const raw=/^CARD_FILES_JSON: (.+)$/m.exec(log);
 if(!log.includes('X100VI_CARD_READER_USB_MATCH: yes')||!log.includes('CARD_IMAGE_CAPTURE_SESSION_OPEN: yes')||
    !log.includes('CARD_ENUM_ONLY: yes')||!log.includes(LAST_LINE)||!progress||!count||!jpg||!raf||!raw)
   throw Error('Camera file catalog was not completed or the camera was not positively identified.');
 if(Number(progress[1])!==100)throw Error('Camera media catalog is incomplete.');
 const listed=Number(count[1]);
 if(!Number.isSafeInteger(listed)||listed<0||listed>MAX_ITEMS)throw Error('Camera media count is beyond the supported limit.');
 const names=JSON.parse(raw[1]);
 if(!Array.isArray(names)||names.length>MAX_ITEMS)throw Error('Malformed camera media inventory.');
 const files=[],handles=new Set();
 for(const [index,row] of names.entries()){
   if(!row||typeof row!=='object'||!VALID_NAME.test(row.name)||!SUPPORTED.has(row.format)||
      !row.name.toUpperCase().endsWith('.'+row.format)||
      !Number.isSafeInteger(row.bytes)||row.bytes<128||row.bytes>MAX_FILE_BYTES||
      !Number.isSafeInteger(row.handle)||row.handle<0||row.handle>0xffffffff||
      (row.handle!==0&&handles.has(row.handle)))
     throw Error('Untrusted or duplicate PTP file identity in camera inventory.');
   // ImageCaptureCore on Jarvis exposes 198 valid items but reports
   // ptpObjectHandle=0 for every one. This is an unavailable handle,
   // not 198 duplicate photographs. Distinct *catalog display* IDs
   // use their snapshot index; they are not safe cross-session import IDs.
   if(row.handle!==0)handles.add(row.handle);
   const id=crypto.createHash('sha256').update(row.name).update('\0').update(String(row.bytes))
     .update('\0').update(String(row.handle)).update('\0').update(String(index)).digest('hex').slice(0,32);
   files.push({id,name:row.name,format:row.format,bytes:row.bytes});
 }
 if(files.length>listed)throw Error('Camera file count differs from the inventory.');
 const jpgCount=files.filter(f=>f.format==='JPG'||f.format==='JPEG').length;
 const rafCount=files.filter(f=>f.format==='RAF').length;
 if(jpgCount!==Number(jpg[1])||rafCount!==Number(raf[1]))
   throw Error('Camera JPEG/RAW counts do not agree with the detailed catalog.');
 return {count:files.length,jpeg:jpgCount,raf:rafCount,files,complete:true,
   persistentPtpObjectHandles:files.length===handles.size,
   note:'Read-only Image Capture file inventory; IDs are valid only for this display snapshot. No camera originals downloaded.'};
}

export function terminalCommandContents(binary,output){
 // Neither path comes from a web request: both are owned by this application's
 // fixed root and internally generated job ID. Still robustly escape them for
 // shell AND AppleScript, to avoid executing arbitrary source filenames.
 for(const item of [binary,output]){
   if(typeof item!=='string'||!path.isAbsolute(item)||/[\r\n\0]/.test(item))throw Error('Unsafe native helper location.');
 }
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  return '#!/bin/sh\n'+quote(binary)+' --read-only > '+quote(output)+' 2>&1\n';
}

async function launchDefault(scriptFile){
 // LaunchServices opens a signed-in graphical Terminal without requiring
 // the background Node service to control it through Apple Events/TCC.
 await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-a','Terminal',scriptFile],
   {timeout:12000,maxBuffer:16*1024},error=>error?reject(error):resolve()));
}

export class UsbPtpCardCatalog {
 constructor({root,appRoot,launcher=launchDefault,clock=()=>Date.now(),maxAgeMs=TIMEOUT_MS}={}){
   if(!root||!appRoot)throw Error('Native photo root and application path are required.');
   this.root=path.resolve(root);
   this.binary=path.join(path.resolve(appRoot),'tools','.bin','x100vi-card-reader-list');
   this.launcher=launcher;this.clock=clock;this.maxAgeMs=maxAgeMs;
   this.state='idle';this.startedAt=null;this.completedAt=null;this.job=null;
   this.output=null;this.error=null;this.receipt=null;
 }
 status(){
   return {state:this.state,running:this.state==='scanning',startedAt:this.startedAt,completedAt:this.completedAt,
     error:this.error,count:this.receipt?.count??null,jpeg:this.receipt?.jpeg??null,raf:this.receipt?.raf??null,
     files:this.receipt?.files??[],readOnly:true,source:'macos-ImageCaptureCore-PTP',
     imported:0,note:'Lists existing X100VI files only; does not import or modify camera photographs.'};
 }
 async start(){
   if(this.state==='scanning')throw Error('A read-only camera catalog is already in progress.');
   if(process.platform!=='darwin')throw Error('Camera catalog requires macOS.');
   const binaryStat=await fs.lstat(this.binary);
   if(!binaryStat.isFile()||binaryStat.isSymbolicLink()||(binaryStat.mode&0o111)===0)
     throw Error('Expected signed-in Mac native catalog helper is missing or not executable.');
   const root=await fs.realpath(this.root);
   if(root!==this.root)throw Error('Photo root must be a real, mounted folder.');
   const jobDir=path.join(root,'Projects','USB-Card-Catalog');
   await fs.mkdir(jobDir,{recursive:true,mode:0o700});
   const stat=await fs.lstat(jobDir);
   if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(jobDir)!==jobDir)throw Error('Unsafe camera catalog directory.');
   const job=crypto.randomUUID();
   const output=path.join(jobDir,'catalog-'+job+'.log');
   const scriptFile=path.join(jobDir,'catalog-'+job+'.command');
   await fs.writeFile(output,'',{flag:'wx',mode:0o600});
   await fs.writeFile(scriptFile,terminalCommandContents(this.binary,output),{flag:'wx',mode:0o700});
   this.state='scanning';this.startedAt=this.clock();this.completedAt=null;
   this.job=job;this.output=output;this.error=null;this.receipt=null;
   try{
     await this.launcher(scriptFile);
   }catch(error){
     this.state='error';this.error='Could not start macOS graphical camera catalog: '+String(error.message).slice(0,145);
   }
   return this.status();
 }
 async refresh(){
   if(this.state!=='scanning')return this.status();
   const log=await fs.readFile(this.output,'utf8').catch(error=>{
     if(error.code==='ENOENT')return '';
     throw error;
   });
   if(Buffer.byteLength(log)>MAX_BYTES){this.state='error';this.error='Camera output was unexpectedly large.';}
   else if(log.includes(LAST_LINE)){
     try{this.receipt=parsePtpCardCatalog(log);this.state='completed';this.completedAt=this.clock();}
     catch(error){this.state='error';this.error=String(error.message).slice(0,220);}
   }else if(log.includes('CARD_STOP:')){
     this.state='error';this.error=(/CARD_STOP: ([^\r\n]{1,150})/.exec(log)||[])[1]||'Camera catalog was interrupted.';
   }else if(this.clock()-this.startedAt>this.maxAgeMs){
     this.state='error';this.error='The camera did not finish cataloging in the graphical Mac session; select X100VI in Image Capture and retry.';
   }
   return this.status();
 }
}
