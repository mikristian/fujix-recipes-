import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native pairing discovery does not depend on advertising secure service UUID',()=>{
  const source=readFileSync(new URL('../ble-native.swift', import.meta.url),'utf8');
  assert.match(source,/scanForPeripherals\(withServices:nil/);
  assert.match(source,/contains\("X100VI"\)/);
  assert.match(source,/F557D96B/);
  assert.match(source,/STATUS_CHALLENGE_READ/);
  assert.doesNotMatch(source,/0x02,\s*0x00/);
});

test('native Wi-Fi shutter is explicit, single attempt and never seizes camera priority',()=>{
  const code=readFileSync(new URL('../../research/fujix-direct-wifi-20261031/direct-live.c',import.meta.url),'utf8');
  assert.match(code,/strcmp\(line,"SHOOT\\n"\)/);
  assert.match(code,/int shutter_attempted=0/);
  assert.match(code,/if\(shutter_attempted\)/);
  assert.match(code,/ptp_init_capture\(r,0,0\)/);
  assert.match(code,/PTP_SHUTTER_REQUEST_ACCEPTED/);
  assert.doesNotMatch(code,/PTP_DPC_FUJI_PriorityMode|PriorityModeHost/);
});

test('native Bluetooth launch failures and expired scan states do not falsely advertise shutter authentication',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/Cannot start macOS Bluetooth diagnostic/);
  assert.match(server,/bleDiagnostic\.running=false;bleDiagnostic\.stage='error'/);
  assert.match(server,/Date\.now\(\)-\(bleDiagnostic\.lastRun\|\|0\)>45000/);
  assert.match(server,/Native Bluetooth diagnostic failed/);
});
