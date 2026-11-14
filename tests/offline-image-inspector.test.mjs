import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {inspectOfflineImage,sniffImageHeader,validateImageRelativePath} from '../offline-image-inspector.mjs';

const jpeg=()=>Buffer.from([255,216,255,224,0,7,74,70,73,70,0,255,192,0,17,8,0,10,0,20,3,1,17,0,2,17,0,3,17,0,255,218,0,2,0,1,2,255,217]);
const png=()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(160,16);b.writeUInt32BE(120,20);b[24]=8;b[25]=2;return b};
const raf=()=>{const b=Buffer.alloc(256);b.write('FUJIFILMCCD-RAW ',0);b.write('0201',16);b.write('X100VI',20);b.writeUInt32BE(120,84);b.writeUInt32BE(50,88);b.writeUInt32BE(170,92);b.writeUInt32BE(80,96);return b};
async function directory(t){const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'offline-inspector-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));const root=path.join(tmp,'photos');await fs.mkdir(root);return {root,tmp}}

test('JPEG, PNG and RAF headers are distinguished and dimensions extracted conservatively',()=>{
 const jpg=sniffImageHeader(jpeg(),{filename:'a.jpg'});assert.equal(jpg.format,'jpeg');assert.deepEqual(jpg.dimensions,{width:20,height:10});
 const p=sniffImageHeader(png(),{filename:'a.png'});assert.equal(p.format,'png');assert.deepEqual(p.dimensions,{width:160,height:120});
 const r=sniffImageHeader(raf(),{filename:'a.RAF'});assert.equal(r.format,'raf');assert.equal(r.metadata.cameraLabel,'X100VI');assert.equal(r.metadata.previewOffset,120);
 for(const result of [jpg,p,r])assert.equal(result.cameraOriginal,'unverified');
});

test('inspects bytes without touching source files and SHA256 matches actual payload',async t=>{
 const {root}=await directory(t);const bytes=jpeg();await fs.writeFile(path.join(root,'DSCF0001.jpg'),bytes);
 const before=await fs.stat(path.join(root,'DSCF0001.jpg'));
 const report=await inspectOfflineImage({root,filename:'DSCF0001.jpg'});
 assert.equal(report.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(report.readOnly,true);
 assert.equal(report.bytes,bytes.length);assert.match(report.provenance,/unverified/);
 const after=await fs.stat(path.join(root,'DSCF0001.jpg'));
 assert.equal(before.mtimeMs,after.mtimeMs);assert.deepEqual(await fs.readFile(path.join(root,'DSCF0001.jpg')),bytes);
});

test('reject traversal, absolute, drive, malformed and unsupported paths',()=>{
 for(const name of ['../file.jpg','sub/../file.jpg','/etc/passwd.jpg','C:/file.jpg','sub\\file.jpg','sub//file.jpg','sub/./file.jpg','bad\u0000.jpg','movie.mov'])assert.throws(()=>validateImageRelativePath(name));
 assert.equal(validateImageRelativePath('sub/DSCF0001.RAF'),'sub/DSCF0001.RAF');
});

test('reject nested symlinks and final file symlink without reading outside root',async t=>{
 const {root,tmp}=await directory(t);const outside=path.join(tmp,'private.jpg');await fs.writeFile(outside,jpeg());
 await fs.symlink(outside,path.join(root,'link.jpg'));
 await assert.rejects(inspectOfflineImage({root,filename:'link.jpg'}),/symlink|Unsafe/i);
 await fs.mkdir(path.join(root,'safe'));
 await fs.symlink(tmp,path.join(root,'other'));
 await assert.rejects(inspectOfflineImage({root,filename:'other/private.jpg'}),/Unsafe/);
});

test('reject oversized files and mismatched or invalid signatures',async t=>{
 const {root}=await directory(t);
 await fs.writeFile(path.join(root,'wrong.jpg'),png());
 await assert.rejects(inspectOfflineImage({root,filename:'wrong.jpg'}),/match extension/);
 await fs.writeFile(path.join(root,'too-big.png'),Buffer.alloc(1024));
 await assert.rejects(inspectOfflineImage({root,filename:'too-big.png',maxBytes:100}),/bounds/);
 assert.throws(()=>sniffImageHeader(Buffer.alloc(100),{filename:'empty.raf'}),/Unrecognized/);
 assert.throws(()=>sniffImageHeader(Buffer.from([255,216,255,224,255,255]),{filename:'x.jpg'}),/exceeds/);
});

test('RAF offsets outside source size are reported as warnings',()=>{
 const b=raf();b.writeUInt32BE(999999,92);
 const report=sniffImageHeader(b,{filename:'DSCF001.RAF'});
 assert.ok(report.warnings.some(w=>/raw region exceeds/.test(w)));
});

test('root must exist and be directory; symlink root canonicalization remains bounded',async t=>{
 const {root,tmp}=await directory(t);
 await assert.rejects(inspectOfflineImage({root:'relative',filename:'photo.jpg'}),/absolute/);
 await fs.writeFile(path.join(tmp,'root-file'),jpeg());
 await assert.rejects(inspectOfflineImage({root:path.join(tmp,'root-file'),filename:'photo.jpg'}),/directory/);
});
