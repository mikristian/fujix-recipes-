import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {parsePtpCardCatalog} from '../usb-ptp-card-catalog.mjs';
import {LocalPhotoLibrary} from '../local-photo-library.mjs';
import {UsbPtpSelectedImport,selectPtpOriginals,selectedPtpCommand,
  verifyPtpNativeReceipt,hashPtpOriginal} from '../usb-ptp-selected-import.mjs';

const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(512,68),Buffer.from([255,217])]);
const raf=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(512,71)]);
const rawFiles=[
 {name:'DSCF1001.JPG',format:'JPG',bytes:jpeg.length,handle:0},
 {name:'DSCF1001.RAF',format:'RAF',bytes:raf.length,handle:0},
];
function catalogFrom(rows=rawFiles,now=500000){
 const output=['X100VI_CARD_READER_USB_MATCH: yes','CARD_IMAGE_CAPTURE_SESSION_OPEN: yes',
  'CARD_CATALOG_PROGRESS: 100','CARD_FILE_COUNT: '+rows.length,
  'CARD_JPEG_COUNT: '+rows.filter(x=>x.format==='JPG'||x.format==='JPEG').length,
  'CARD_RAF_COUNT: '+rows.filter(x=>x.format==='RAF').length,
  'CARD_FILES_JSON: '+JSON.stringify(rows),
  'CARD_ENUM_ONLY: yes','CARD_DOWNLOAD_ATTEMPTED: no'].join('\n');
 return {state:'completed',receipt:parsePtpCardCatalog(output),completedAt:now};
}
async function fixture(t,{catalog=catalogFrom(),bytesForName=name=>name.endsWith('RAF')?raf:jpeg,failNative=false,onDownload=null}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fujix-selected-import-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const appRoot=path.join(root,'app');
 const bin=path.join(appRoot,'tools','.bin','x100vi-card-reader-copy-selected');
 await fs.mkdir(path.dirname(bin),{recursive:true});
 await fs.writeFile(bin,'#!/bin/sh\n',{mode:0o700});
 const library=new LocalPhotoLibrary({root,maxItems:2000});
 const calls=[];
 const launcher=async script=>{
   const content=await fs.readFile(script,'utf8');
   const args=[...content.matchAll(/'([^']+)'/g)].map(m=>m[1]);
   assert.equal(args.length,7);
   const [binary,mode,filename,length,folder,output,log]=args;
   assert.equal(binary,bin);assert.equal(mode,'--copy-selected');
   const data=bytesForName(filename);
   assert.equal(data.length,Number(length));
   calls.push({filename,output,folder});
   if(failNative){
     await fs.writeFile(log,'COPY_STOP: Selected camera name/size is missing or ambiguous (0 matches)\n');
     return;
   }
   const local=path.join(folder,output);
   await fs.writeFile(local,data,{flag:'wx'});
   await fs.writeFile(log,[
     'X100VI_USB_MATCH: yes','X100VI_MEDIA_CATALOG_COMPLETE: yes',
     'COPY_SELECTED_'+(filename.endsWith('.RAF')?'RAF':'JPEG')+'_REQUESTED: yes',
     'COPY_FRESH_CATALOG_EXACT_MATCH_COUNT: 1',
     'COPY_EXPECTED_BYTES: '+length,'COPY_OUTPUT_NAME: '+output,
     'COPY_DELETION_ALLOWED: no','COPY_OVERWRITE_ALLOWED: no',
     'COPY_SUCCESS: yes','COPY_VERIFIED_LENGTH: '+length,
     'COPY_OUTPUT_NAME: '+output,
   ].join('\n')+'\n');
   if(onDownload)onDownload();
 };
 const job=new UsbPtpSelectedImport({root,appRoot,catalog,library,launcher,
   clock:()=>500000,sleepFn:async()=>{},platform:'darwin'});
 return {job,library,root,calls};
}

test('exact selected camera metadata is required, never PTP zero handles or an ambiguous filename',()=>{
 const catalog=catalogFrom();
 const ids=catalog.receipt.files.map(x=>x.id);
 assert.deepEqual(selectPtpOriginals(catalog,ids,500000).map(x=>x.name),['DSCF1001.JPG','DSCF1001.RAF']);
 assert.throws(()=>selectPtpOriginals(catalog,[ids[0],ids[0]],500000),/distinct/);
 assert.throws(()=>selectPtpOriginals(catalog,['a'.repeat(32)],500000),/unavailable/);
 assert.throws(()=>selectPtpOriginals(catalog,ids,500000+21*60*1000),/expired/);
 const repeated=catalogFrom([rawFiles[0],rawFiles[0]]);
 assert.throws(()=>selectPtpOriginals(repeated,[repeated.receipt.files[0].id],500000),/Ambiguous/);
});

test('selected native command is strictly escaped and requires no camera deletion',()=>{
 const command=selectedPtpCommand({binary:'/tmp/with space/native',filename:'DSCF1234.JPG',bytes:512,
   folder:'/tmp/fujix-import',output:'FujiX-Selected-test.JPG',log:'/tmp/out.log'});
 assert.match(command,/--copy-selected/);
 assert.match(command,/^#!\/bin\/sh\n/);
 assert.match(command,/DSCF1234.JPG/);
 assert.doesNotMatch(command,/--delete|--overwrite|--shutter/);
 assert.throws(()=>selectedPtpCommand({binary:'../../sh',filename:'a.JPG',bytes:200,folder:'/tmp',output:'x.JPG',log:'/tmp/x'}),/Unsafe/);
 assert.throws(()=>selectedPtpCommand({binary:'/tmp/sh',filename:'../../passwd',bytes:200,folder:'/tmp',output:'x.JPG',log:'/tmp/x'}),/Unsafe/);
});

test('native receipt rejects wrong object, size, missing exact match or unsupported operations',()=>{
 const info={output:'FujiX-Selected-123.JPG',bytes:512,format:'JPG'};
 const valid=[
  'X100VI_USB_MATCH: yes','X100VI_MEDIA_CATALOG_COMPLETE: yes',
  'COPY_SELECTED_JPEG_REQUESTED: yes','COPY_FRESH_CATALOG_EXACT_MATCH_COUNT: 1',
  'COPY_DELETION_ALLOWED: no','COPY_OVERWRITE_ALLOWED: no',
  'COPY_OUTPUT_NAME: '+info.output,'COPY_SUCCESS: yes','COPY_VERIFIED_LENGTH: 512',
  'COPY_OUTPUT_NAME: '+info.output,
 ].join('\n');
 assert.equal(verifyPtpNativeReceipt(valid,info).bytes,512);
 assert.throws(()=>verifyPtpNativeReceipt(valid.replace('EXACT_MATCH_COUNT: 1','EXACT_MATCH_COUNT: 2'),info));
 assert.throws(()=>verifyPtpNativeReceipt(valid.replace('DELETION_ALLOWED: no','DELETION_ALLOWED: yes'),info));
 assert.throws(()=>verifyPtpNativeReceipt(valid.replace('COPY_VERIFIED_LENGTH: 512','COPY_VERIFIED_LENGTH: 513'),info));
 assert.throws(()=>verifyPtpNativeReceipt(valid.replace('123.JPG','124.JPG'),info));
});

test('selecting one JPEG and one RAW imports both and prevents duplicate reimports by SHA-256',async t=>{
 const {job,library,calls}=await fixture(t);
 const ids=job.catalog.receipt.files.map(f=>f.id);
 let started=await job.start(ids);
 assert.equal(started.state,'importing');
 await job.promise;
 let status=job.status();
 assert.equal(status.state,'completed');
 assert.equal(status.imported,2);
 assert.equal(status.duplicates,0);
 assert.equal(calls.length,2);
 assert.equal((await library.list()).count,2);
 const saved=await library.list();
 for(const [file,data] of [[saved.files.find(x=>x.name.endsWith('JPG')),jpeg],
                            [saved.files.find(x=>x.name.endsWith('RAF')),raf]]){
   assert.ok(file);
   assert.equal(file.bytes,data.length);
   assert.equal(await hashPtpOriginal(path.join(library.originals,file.savedName),
     file.bytes,file.name.endsWith('RAF')?'RAF':'JPG'),crypto.createHash('sha256').update(data).digest('hex'));
 }
 await job.start(ids);
 await job.promise;
 status=job.status();
 assert.equal(status.state,'completed');
 assert.equal(status.imported,0);
 assert.equal(status.duplicates,2);
 assert.equal((await library.list()).count,2);
 const jobs=await fs.readdir(path.join(job.root,'Projects','USB-Card-Selected-Imports'));
 assert.equal(jobs.length,2);
});

test('dedup scans every canonical original, even when limited Library list cannot display it',async t=>{
 const {job,library}=await fixture(t);
 library.maxItems=0;
 const input=await import('node:stream');
 const stream=input.Readable.from([jpeg]);
 stream.headers={'content-length':String(jpeg.length)};
 const prior=await library.write(stream,{kind:'original',filename:'DSCF1001.JPG'});
 assert.equal((await library.list()).files.length,0);
 await job.start([job.catalog.receipt.files[0].id]);
 await job.promise;
 assert.equal(job.status().state,'completed');
 assert.equal(job.status().duplicates,1);
 assert.equal(job.status().imported,0);
 assert.equal(job.status().items[0].archiveId,prior.id);
 const files=await fs.readdir(library.originals);
 assert.equal(files.length,1);
});

test('missing selected camera file fails safely and does not archive or erase anything',async t=>{
 const {job,library}=await fixture(t,{failNative:true});
 await job.start([job.catalog.receipt.files[0].id]);
 await job.promise;
 assert.equal(job.status().state,'error');
 assert.match(job.status().error,/missing or ambiguous/);
 assert.equal((await library.list()).count,0);
});

test('stop-after-current-file preserves its completed original but skips later selections',async t=>{
 let instance;
 const fixtureData=await fixture(t,{onDownload:()=>instance.cancel()});
 instance=fixtureData.job;
 const ids=instance.catalog.receipt.files.map(x=>x.id);
 await instance.start(ids);
 await instance.promise;
 assert.equal(instance.status().state,'cancelled');
 assert.equal(instance.status().imported,1);
 assert.equal(fixtureData.calls.length,1);
 assert.equal((await fixtureData.library.list()).count,1);
});

test('invalid camera JPEG bytes are rejected with no library original',async t=>{
 const {job,library}=await fixture(t,{bytesForName:()=>Buffer.alloc(jpeg.length,5)});
 await job.start([job.catalog.receipt.files[0].id]);
 await job.promise;
 assert.equal(job.status().state,'error');
 assert.match(job.status().error,/signature/);
 assert.equal((await library.list()).count,0);
});
