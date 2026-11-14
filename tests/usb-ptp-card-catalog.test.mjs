import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {parsePtpCardCatalog,terminalCommandContents,UsbPtpCardCatalog} from '../usb-ptp-card-catalog.mjs';

function output(items=[
 {name:'DSCF0001.JPG',format:'JPG',bytes:150000,handle:1049},
 {name:'DSCF0001.RAF',format:'RAF',bytes:83400000,handle:1050},
]){
 return [
  'X100VI_CARD_READER_USB_MATCH: yes',
  'Opening read-only macOS camera catalog session...',
  'CARD_IMAGE_CAPTURE_SESSION_OPEN: yes',
  'CARD_CATALOG_PROGRESS: 100',
  'CARD_FILE_COUNT: '+items.length,
  'CARD_JPEG_COUNT: '+items.filter(f=>f.format==='JPG'||f.format==='JPEG').length,
  'CARD_RAF_COUNT: '+items.filter(f=>f.format==='RAF').length,
  'CARD_MEDIA_BYTES: '+items.reduce((total,f)=>total+f.bytes,0),
  'CARD_FILES_JSON: '+JSON.stringify(items),
  'CARD_ENUM_ONLY: yes',
  'CARD_DOWNLOAD_ATTEMPTED: no',
 ].join('\n')+'\n';
}
test('PTP read-only inventory requires genuine camera, complete catalog, and consistent counts',()=>{
 const receipt=parsePtpCardCatalog(output());
 assert.equal(receipt.count,2);
 assert.equal(receipt.jpeg,1);
 assert.equal(receipt.raf,1);
 assert.match(receipt.files[0].id,/^[a-f0-9]{32}$/);
 assert.deepEqual(receipt.files.map(f=>f.name),['DSCF0001.JPG','DSCF0001.RAF']);
 assert.ok(receipt.complete);
 assert.doesNotMatch(JSON.stringify(receipt),/serial|gps|exif/i);
 assert.throws(()=>parsePtpCardCatalog(output().replace('CARD_CATALOG_PROGRESS: 100','CARD_CATALOG_PROGRESS: 88')),/incomplete/);
 assert.throws(()=>parsePtpCardCatalog(output().replace('CARD_DOWNLOAD_ATTEMPTED: no','CARD_DOWNLOAD_ATTEMPTED: yes')),/not completed/);
 assert.throws(()=>parsePtpCardCatalog(output().replace('X100VI_CARD_READER_USB_MATCH: yes','USB PTP Camera')),/positively identified/);
 assert.throws(()=>parsePtpCardCatalog(output().replace('CARD_JPEG_COUNT: 1','CARD_JPEG_COUNT: 2')),/do not agree/);
});

test('PTP camera IDs enforce safe filenames and fail closed on malformed or oversized file metadata',()=>{
 for(const rows of [
  [{name:'../outside.JPG',format:'JPG',bytes:1234,handle:1}],
  [{name:'x.JPG',format:'JPG',bytes:1234,handle:-1}],
  [{name:'DSCF0001.JPG',format:'RAF',bytes:1234,handle:1}],
  [{name:'DSCF0001.JPG',format:'JPG',bytes:201*1024*1024,handle:1}],
  [{name:'DSCF0001.JPG',format:'JPG',bytes:12000,handle:1},
   {name:'DSCF0002.JPG',format:'JPG',bytes:12000,handle:1}],
 ]) assert.throws(()=>parsePtpCardCatalog(output(rows)),/Untrusted|duplicate/);
 assert.throws(()=>parsePtpCardCatalog(' '.repeat(500_000)),/safe limit/);
});

test('physical Jarvis Image Capture catalogs with unavailable zero PTP handles remain read-only and distinguishable',()=>{
 const files=[
  {name:'DSCF0012.JPG',format:'JPG',bytes:9298305,handle:0},
  {name:'DSCF0012.RAF',format:'RAF',bytes:83552768,handle:0},
  {name:'DSCF0012.JPG',format:'JPG',bytes:9298305,handle:0},
 ];
 const catalog=parsePtpCardCatalog(output(files));
 assert.equal(catalog.count,3);
 assert.equal(catalog.persistentPtpObjectHandles,false);
 assert.equal(new Set(catalog.files.map(x=>x.id)).size,3);
 assert.match(catalog.note,/display snapshot/);
});

test('Graphical Terminal script uses quoted fixed native binary and output paths',()=>{
 const script=terminalCommandContents('/Volumes/Expansion/My Photos/native tool','/Volumes/Expansion/My Photos/catalog.log');
 assert.match(script,/^#!\/bin\/sh\n/);
 assert.match(script,/--read-only/);
 assert.match(script,/catalog\.log/);
 assert.throws(()=>terminalCommandContents('relative','/tmp/file'),/Unsafe/);
 assert.throws(()=>terminalCommandContents('/tmp/bin','/tmp/unsafe\nname'),/Unsafe/);
});

test('native catalog can complete through an injected graphical Terminal launcher without modifying camera media',async t=>{
 const raw=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-ptp-card-catalog-'));
 t.after(()=>fs.rm(raw,{recursive:true,force:true}));
 const root=await fs.realpath(raw);
 const appRoot=path.join(root,'app');
 const bin=path.join(appRoot,'tools','.bin','x100vi-card-reader-list');
 await fs.mkdir(path.dirname(bin),{recursive:true});
 await fs.writeFile(bin,'#!/bin/sh\n', {mode:0o700});
 let now=1000,script='';
 const runner=async incoming=>{
   script=await fs.readFile(incoming,'utf8');
   const match=/catalog-([a-f0-9-]+)\.log/.exec(script);
   assert.ok(match);
   const out=path.join(root,'Projects','USB-Card-Catalog','catalog-'+match[1]+'.log');
   await fs.writeFile(out,output());
 };
 const catalog=new UsbPtpCardCatalog({root,appRoot,launcher:runner,clock:()=>now});
 assert.equal(catalog.status().state,'idle');
 const first=await catalog.start();
 assert.equal(first.state,'scanning');
 assert.match(script,/--read-only/);
 assert.match(script,/x100vi-card-reader-list/);
 const done=await catalog.refresh();
 assert.equal(done.state,'completed');
 assert.equal(done.count,2);
 assert.equal(done.files.length,2);
 assert.equal(done.imported,0);
 assert.equal(done.readOnly,true);
 await assert.doesNotReject(catalog.start());
 const again=await catalog.refresh();
 assert.equal(again.state,'completed');
});

test('catalog times out without success markers and does not report zero photos',async t=>{
 const raw=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-ptp-card-timeout-'));
 t.after(()=>fs.rm(raw,{recursive:true,force:true}));
 const root=await fs.realpath(raw),appRoot=path.join(root,'app');
 const bin=path.join(appRoot,'tools','.bin','x100vi-card-reader-list');
 await fs.mkdir(path.dirname(bin),{recursive:true});
 await fs.writeFile(bin,'#!/bin/sh\n',{mode:0o700});
 let now=1000;
 const catalog=new UsbPtpCardCatalog({root,appRoot,launcher:async()=>{},clock:()=>now,maxAgeMs:250});
 await catalog.start();
 now+=300;
 const result=await catalog.refresh();
 assert.equal(result.state,'error');
 assert.equal(result.count,null);
 assert.match(result.error,/did not finish cataloging/);
});
