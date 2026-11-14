import {strict as assert} from 'node:assert';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assembleCapturedRounds} from './x100vi-slot-capture-assemble.mjs';
import {PROPERTY_IDS} from './x100vi-slot-backup.mjs';

const root = mkdtempSync(join(tmpdir(),'x100vi-cslot-two-pass-test-'));
const path1=join(root,'round1'), path2=join(root,'round2');
mkdirSync(path1);mkdirSync(path2);
const slotName = n => Buffer.from([3,67,0,48+n,0,0,0]).toString('hex');
const fixture = (slot) => {
  const properties = Object.fromEntries(PROPERTY_IDS.map(id => [id,{hex:'0100',value:1}]));
  properties.D18C = {hex:Buffer.from([slot,0]).toString('hex'),value:slot};
  properties.D18D = {hex:slotName(slot),value:`C${slot}`};
  return {ok:true,source:'ImageCaptureCore PTP read-only',model:'X100VI',
    serial:'SYNTHETIC-TEST-001',onlyCurrentSlot:true,writeCommands:false,
    complete26Properties:true,activeSlot:slot,slotName:`C${slot}`,properties,warnings:[]};
};
try {
  for (let slot=1;slot<=7;slot++) {
    const record=fixture(slot);
    writeFileSync(join(path1,`current-${slot}.json`),JSON.stringify(record));
    writeFileSync(join(path2,`current-${slot}.json`),JSON.stringify(record));
  }
  const valid=assembleCapturedRounds(path1,path2);
  assert.equal(valid.validation.slots.length,7);
  assert.equal(valid.validation.hardwareVerified,false);
  assert.equal(valid.validation.restoreVerified,false);
  assert.equal(valid.validation.roundsCompared,2);
  const output=join(root,'two-pass.json');
  const tool=fileURLToPath(new URL('./x100vi-slot-capture-assemble.mjs',import.meta.url));
  const cli=spawnSync(process.execPath,[tool,'--round1',path1,'--round2',path2,'--output',output],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);
  const saved=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(saved.rounds[0].slots[0].properties.D18C,'0100');
  const overwrite=spawnSync(process.execPath,[tool,'--round1',path1,'--round2',path2,'--output',output],{encoding:'utf8'});
  assert.equal(overwrite.status,2,'existing capture output must not be overwritten');

  const invalidCases = [
    ['different round directories', ()=>assembleCapturedRounds(path1,path1)],
    ['changed readback bytes',()=>{
      const bad=fixture(5);bad.properties.D1A5.hex='0200';
      writeFileSync(join(path2,'current-5.json'),JSON.stringify(bad));
      return assembleCapturedRounds(path1,path2);
    }],
    ['serial mismatch',()=>{
      const bad=fixture(5);bad.serial='SYNTHETIC-OTHER';
      writeFileSync(join(path2,'current-5.json'),JSON.stringify(bad));
      return assembleCapturedRounds(path1,path2);
    }],
    ['wrong C-slot report',()=>{
      const bad=fixture(5);bad.activeSlot=4;
      writeFileSync(join(path2,'current-5.json'),JSON.stringify(bad));
      return assembleCapturedRounds(path1,path2);
    }],
    ['attempted camera write claim',()=>{
      const bad=fixture(5);bad.writeCommands=true;
      writeFileSync(join(path2,'current-5.json'),JSON.stringify(bad));
      return assembleCapturedRounds(path1,path2);
    }],
    ['incomplete PTP property list',()=>{
      const bad=fixture(5);delete bad.properties.D1A5;
      writeFileSync(join(path2,'current-5.json'),JSON.stringify(bad));
      return assembleCapturedRounds(path1,path2);
    }],
  ];
  for (const [name, fn] of invalidCases) {
    assert.throws(fn,undefined,name);
    writeFileSync(join(path2,'current-5.json'),JSON.stringify(fixture(5)));
  }
  console.log(`PASS: 2 complete synthetic C1-C7 capture rounds, CLI creation, overwrite refusal, ${invalidCases.length} negative checks`);
  console.log('CAMERA_CONNECTIONS_ZERO HARDWARE_VERIFIED_FALSE RESTORE_VERIFIED_FALSE');
} finally {rmSync(root,{recursive:true,force:true});}
