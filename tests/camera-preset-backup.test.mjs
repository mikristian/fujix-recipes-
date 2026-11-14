import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {saveCameraPresetBackup,verifyCameraPresetBackup,validateCameraPresetSnapshot} from '../camera-preset-backup.mjs';

function snapshot(){
 return {format:'fujix-camera-ptp-presets',version:1,capturedAt:'2026-11-04T17:00:00.000Z',originalSlot:3,
  camera:{model:'X100VI',serial:'hardware-fixture-123',firmware:'1.31',usbVendorId:0x04cb,usbProductId:0x0305},
  slots:Array.from({length:7},(_,i)=>({slot:i+1,name:'Test C'+(i+1),properties:Array.from({length:24},(_,j)=>({id:0xD18E+j,hex:j===4?'0b00':'0100',value:j===4?11:1}))}))};
}

test('camera-derived seven-slot backup is durable, hashes match, and no source data is modified',async()=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-camera-presets-'));
 try{
  const original=snapshot();const old=JSON.stringify(original);
  const result=await saveCameraPresetBackup(original,{root});
  assert.equal(result.stored,true);assert.equal(result.slots,7);
  assert.match(result.id,/^20\d{6}T\d{6}Z-[a-f0-9]{10}$/);
  assert.equal(JSON.stringify(original),old,'save must not modify source object');
  const verification=await verifyCameraPresetBackup({root,id:result.id,sha256:result.sha256});
  assert.equal(verification.verified,true);
  assert.equal(verification.camera.serial,original.camera.serial);
  await fsp.appendFile(path.join(root,result.id+'.json'),'\n');
  await assert.rejects(()=>verifyCameraPresetBackup({root,id:result.id,sha256:result.sha256}),/checksum mismatch/);
 }finally{await fsp.rm(root,{recursive:true,force:true})}
});

test('rejects incomplete, duplicate, spoofed camera identity, and malformed raw properties',()=>{
 const valid=snapshot();
 assert.equal(validateCameraPresetSnapshot(valid).slots.length,7);
 for(const invalid of [
  {...valid,slots:valid.slots.slice(0,6)},
  {...valid,camera:{...valid.camera,usbProductId:0x0304}},
  {...valid,slots:valid.slots.map((x,i)=>i===4?{...x,properties:[]}:x)},
  {...valid,slots:valid.slots.map((x,i)=>i===0?{...x,properties:[...x.properties.slice(0,-1),x.properties[0]]}:x)},
  {...valid,slots:valid.slots.map((x,i)=>i===0?{...x,properties:x.properties.map(p=>p.id===0xD192?{...p,hex:'abcdef'}:p)}:x)},
 ])assert.throws(()=>validateCameraPresetSnapshot(invalid));
});

test('backup verification blocks path traversal and wrong checksums',async()=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'fujix-camera-presets-'));
 try{
  const result=await saveCameraPresetBackup(snapshot(),{root});
  await assert.rejects(()=>verifyCameraPresetBackup({root,id:'../foo',sha256:result.sha256}),/Invalid camera backup receipt/);
  await assert.rejects(()=>verifyCameraPresetBackup({root,id:result.id,sha256:'0'.repeat(64)}),/checksum mismatch/);
 }finally{await fsp.rm(root,{recursive:true,force:true})}
});
