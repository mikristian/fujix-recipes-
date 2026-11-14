import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { manifestFor, validateManifest, STAGES } from './fujix-conversion-preflight.mjs';

const dummy = {name:'sample.RAF',size:2048,sha256:'a'.repeat(64)};
const good = manifestFor(dummy);
assert.equal(validateManifest(good).stages, 12);
assert.equal(good.transmits,false);
assert.equal(good.conversion_enabled,false);
assert.deepEqual(good.steps.map(s=>s.opcode),STAGES.map(s=>s.opcode));
for (const change of [
  m=>{m.steps[7].payload_u16=5;},
  m=>{m.steps[3].opcode='0x100C';},
  m=>{m.steps.reverse();},
  m=>{m.transmits=true;},
  m=>{m.conversion_enabled=true;},
  m=>{m.steps[10].access='read';},
  m=>{m.raf.sha256='';},
  m=>{m.steps[3].object_format='0x5000';},
]) {
  const changed=structuredClone(good);change(changed);
  assert.throws(()=>validateManifest(changed));
}
const dir=mkdtempSync(join(tmpdir(),'fujix-preflight-'));
try {
  const src=join(dir,'fixture.raf'), manifestFile=join(dir,'plan.json');
  const bytes=Buffer.concat([Buffer.from('FUJIFILMCCD-RAW '),Buffer.alloc(112,7)]);
  writeFileSync(src,bytes);
  const file=fileURLToPath(new URL('./fujix-conversion-preflight.mjs',import.meta.url));
  const plan=spawnSync(process.execPath,[file,'--plan',src],{encoding:'utf8'});
  assert.equal(plan.status,0,plan.stderr);
  const generated=JSON.parse(plan.stdout);
  assert.equal(generated.raf.sha256,createHash('sha256').update(bytes).digest('hex'));
  writeFileSync(manifestFile,plan.stdout);
  const validation=spawnSync(process.execPath,[file,'--validate',manifestFile],{encoding:'utf8'});
  assert.equal(validation.status,0,validation.stderr);
  assert.equal(JSON.parse(validation.stdout).ok,true);
  const bad=spawnSync(process.execPath,[file,'--plan',manifestFile],{encoding:'utf8'});
  assert.equal(bad.status,2);
} finally {rmSync(dir,{recursive:true,force:true});}
console.log('Offline manifest validation passed (canonical plan, eight tamper cases, RAF hash, CLI round trip, invalid magic)');
