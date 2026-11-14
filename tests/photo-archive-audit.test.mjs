import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {PhotoArchiveAudit,comparePhotoArchiveAudits} from '../photo-archive-audit.mjs';

const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(512,13),Buffer.from([0xff,0xd9])]);
const raf=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(500,4)]);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-audit-'));
 t.after(()=>fs.rm(root,{force:true,recursive:true}));
 await fs.mkdir(path.join(root,'Originals'));await fs.mkdir(path.join(root,'Captures'));
 return {root,originals:path.join(root,'Originals'),captures:path.join(root,'Captures'),audit:new PhotoArchiveAudit({root})};
}
async function complete(audit){
 const started=await audit.start();
 assert.equal(started.running,true);
 await audit.worker;
 assert.equal(audit.status().state,'completed');
 return JSON.parse(audit.exportReport());
}

test('audit verifies content-addressed card original and read-only JPEG/RAF bytes',async t=>{
 const {audit,originals,root}=await setup(t);
 const jpgName='X100VI-Original-'+hash(jpeg).slice(0,24)+'-DSCF001.JPG';
 const rawName='X100VI-Original-'+hash(raf).slice(0,24)+'-DSCF001.RAF';
 await fs.writeFile(path.join(originals,jpgName),jpeg);
 await fs.writeFile(path.join(originals,rawName),raf);
 const before=await Promise.all([jpgName,rawName].map(name=>fs.readFile(path.join(originals,name))));
 const receipt=await complete(audit);
 assert.equal(receipt.summary.valid,2);
 assert.equal(receipt.summary.issues,0);
 assert.equal(receipt.truncated,false);
 assert.ok(receipt.files.every(x=>x.hashPrefixMatches===true&&x.sha256.length===64));
 assert.deepEqual(await Promise.all([jpgName,rawName].map(name=>fs.readFile(path.join(originals,name)))),before);
 assert.equal((await fs.readdir(root)).length,2,'scanner does not create files');
});

test('audit reports corrupt JPEG, symlink, duplicates, unrecognized files and manual un-attested IDs',async t=>{
 const {audit,originals,captures,root}=await setup(t);
 const file='X100VI-Original-aaaaaaaaaaaaaaaaaaaaaaaa-DSCF003.JPG';
 const dup='X100VI-Original-bbbbbbbbbbbbbbbbbbbbbbbb-DSCF004.JPG';
 await fs.writeFile(path.join(originals,file),jpeg);
 await fs.writeFile(path.join(originals,dup),jpeg);
 await fs.writeFile(path.join(originals,'X100VI-Original-cccccccccccccccccccccccc-DSCF005.JPG'),Buffer.alloc(200,6));
 await fs.writeFile(path.join(root,'private-photo.jpg'),jpeg);
 await fs.symlink(path.join(root,'private-photo.jpg'),path.join(captures,'X100VI-USB-dddddddddddddddddddddddd.jpg'));
 await fs.writeFile(path.join(originals,'not-fuji.JPG'),jpeg);
 const receipt=await complete(audit);
 assert.equal(receipt.summary.scanned,4);
 assert.equal(receipt.summary.valid,2);
 assert.equal(receipt.summary.issues,2);
 assert.equal(receipt.summary.duplicates,1);
 assert.equal(receipt.summary.ignored,1);
 assert.equal(receipt.files.find(x=>x.savedName===file).hashPrefixMatches,false,'random upload IDs are not proof of corruption');
 assert.ok(receipt.issues.some(x=>/Unsafe file/.test(x.issue)));
 assert.ok(receipt.issues.some(x=>/header or ending/.test(x.issue)));
 assert.equal((await fs.readFile(path.join(root,'private-photo.jpg'))).length,jpeg.length);
});

test('portable receipt comparison detects modified, new, missing and unchanged files',async t=>{
 const {audit,originals}=await setup(t);
 const names=['X100VI-Original-aaaaaaaaaaaaaaaaaaaaaaaa-FIRST.JPG','X100VI-Original-bbbbbbbbbbbbbbbbbbbbbbbb-SECOND.JPG','X100VI-Original-cccccccccccccccccccccccc-THIRD.JPG'];
 for(const name of names)await fs.writeFile(path.join(originals,name),jpeg);
 const initial=await complete(audit);
 await fs.writeFile(path.join(originals,names[0]),Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(512,90),Buffer.from([0xff,0xd9])]));
 await fs.rm(path.join(originals,names[1]));
 await fs.writeFile(path.join(originals,'X100VI-Original-dddddddddddddddddddddddd-FOURTH.JPG'),jpeg);
 const later=await complete(audit);
 const result=comparePhotoArchiveAudits(initial,later);
 assert.deepEqual(result.counts,{missing:1,added:1,changed:1,unchanged:1});
 assert.equal(result.readOnly,true);
 assert.equal(audit.compare(initial).counts.changed,1);
});

test('bounded scans and invalid receipts never claim complete proof',async t=>{
 const {root,originals}=await setup(t);
 const limited=new PhotoArchiveAudit({root,maxFiles:1});
 await fs.writeFile(path.join(originals,'X100VI-Original-aaaaaaaaaaaaaaaaaaaaaaaa-A.JPG'),jpeg);
 await fs.writeFile(path.join(originals,'X100VI-Original-bbbbbbbbbbbbbbbbbbbbbbbb-B.JPG'),jpeg);
 const incomplete=await complete(limited);
 assert.equal(incomplete.truncated,true);
 assert.equal(incomplete.summary.complete,false);
 await assert.rejects(Promise.resolve().then(()=>limited.compare(incomplete)),/complete reports/);
 assert.throws(()=>comparePhotoArchiveAudits({...incomplete,version:99},incomplete),/valid FujiX/);
 assert.throws(()=>comparePhotoArchiveAudits({...incomplete,files:[...incomplete.files,...incomplete.files]},incomplete),/Duplicate photo/);
});

test('audit treats archive symlink roots as unsafe and never follows them',async t=>{
 const {root}=await setup(t);
 const alias=path.join(os.tmpdir(),'fujix-audit-alias-'+crypto.randomUUID());
 await fs.symlink(root,alias);
 t.after(()=>fs.rm(alias,{force:true}));
 const audit=new PhotoArchiveAudit({root:alias});
 await audit.start();await audit.worker;
 assert.equal(audit.status().state,'error');
 assert.match(audit.status().detail,/Unsafe/);
 assert.equal(audit.status().reportAvailable,false);
});

test('abandoned card staging is reported as an issue without touching the partial file',async t=>{
 const {originals,audit}=await setup(t);
 const stage='.fujix-card-12345678-1234-1234-1234-123456789012.part';
 await fs.writeFile(path.join(originals,stage),'partial-old-import');
 const receipt=await complete(audit);
 assert.equal(receipt.summary.scanned,0);
 assert.equal(receipt.summary.issues,1);
 assert.match(receipt.issues[0].issue,/Unfinished card-import staging/);
 assert.equal(await fs.readFile(path.join(originals,stage),'utf8'),'partial-old-import');
});

test('cancellation is read-only and no incomplete report is exportable',async t=>{
 const {audit}=await setup(t);
 await audit.start();
 audit.cancel();
 await audit.worker;
 assert.equal(audit.status().state,'canceled');
 assert.equal(audit.status().reportAvailable,false);
 assert.throws(()=>audit.exportReport(),/Complete an archive audit/);
});
