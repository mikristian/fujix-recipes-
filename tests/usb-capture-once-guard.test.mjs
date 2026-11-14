import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'tools','x100vi-ptp-capture-once.m'),'utf8');
const native=path.join(root,'tools','.bin','x100vi-ptp-capture-once');

test('manual USB shutter requires exact device and advertises 100E and read-only 1015 first',()=>{
  assert.match(source,/device\.usbVendorID!=0x04cb \|\| device\.usbProductID!=0x0305/);
  assert.match(source,/hasCapture && hasGetProperty/);
  assert.match(source,/captureGateAllows\(YES,valid,mode\)/);
  assert.match(source,/advertised && modeReplyValid && mode==5/);
  assert.match(source,/0x15,0x10,2,0,0,0,0x6E,0xD1/);
  assert.match(source,/0x0E,0x10,3,0,0,0/);
  // Native command buffers must not include PTP SetDevicePropValue 0x1016.
  assert.doesNotMatch(source,/0x16,0x10,/);
});

test('native self-test blocks RAW mode6 and invalid metadata without camera I/O',()=>{
  if(process.platform!=='darwin'||!fs.existsSync(native))return;
  const result=execFileSync(native,['--offline-selftest'],{encoding:'utf8',timeout:8000});
  assert.match(result,/OFFLINE CAPTURE PREFLIGHT: PASS/);
});

test('no implicit shutter without required explicit CLI flag',()=>{
  if(process.platform!=='darwin'||!fs.existsSync(native))return;
  const result=spawnSync(native,[],{encoding:'utf8',timeout:8000});
  assert.equal(result.status,64);
  assert.match(result.stderr,/--capture-once/);
});
