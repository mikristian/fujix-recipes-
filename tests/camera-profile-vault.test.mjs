import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CameraProfileVault,CAMERA_SLOTS,validateRecipe,validateBackup,diffSnapshots} from '../camera-profile-vault.mjs';

async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-vault-test-'));t.after(()=>fs.rm(root,{force:true,recursive:true}));return {root,vault:new CameraProfileVault({folder:path.join(root,'vault')})}}
const input={name:'Classic Chrome daylight',recipe:{filmSimulation:'Classic Chrome',whiteBalanceShift:{red:2,blue:-3},iso:640,notes:'User transcribed settings'},provenance:{type:'manual',description:'Transcribed from notes',cameraModel:'X100VI'}};

test('seven slots, save, durable read, explicit diff and clear',async t=>{
 const {vault}=await fixture(t);const blank=await vault.read();assert.deepEqual(Object.keys(blank.slots),CAMERA_SLOTS);
 assert.ok(CAMERA_SLOTS.every(s=>blank.slots[s]===null));
 const saved=await vault.saveSlot('C3',input);assert.equal(saved.snapshot.recipe.filmSimulation,'Classic Chrome');assert.ok(saved.changes.some(c=>c.field==='recipe.filmSimulation'));
 assert.equal((await vault.read()).slots.C3.name,input.name);
 const changed=await vault.saveSlot('C3',{...input,recipe:{...input.recipe,iso:800}});
 assert.ok(changed.changes.some(x=>x.field==='recipe.iso'&&x.before===640&&x.after===800));
 assert.ok((await vault.clearSlot('C3')).length>0);assert.equal((await vault.read()).slots.C3,null);
});

test('JSON export/import round trip and dry run preserve records',async t=>{
 const {vault,root}=await fixture(t);await vault.saveSlot('C1',input);
 const json=await vault.exportJSON();const second=new CameraProfileVault({folder:path.join(root,'second')});
 const preview=await second.importJSON(json,{dryRun:true});assert.equal(preview.applied,false);assert.equal((await second.read()).slots.C1,null);
 assert.ok(preview.diff.C1.some(c=>c.field==='recipe.iso'));
 await second.importJSON(json);assert.equal((await second.read()).slots.C1.recipe.iso,640);
 const file=await vault.exportFile('archive.json');assert.equal(path.basename(file),'archive.json');
 await vault.clearSlot('C1');await vault.importFile('archive.json');assert.equal((await vault.read()).slots.C1.recipe.iso,640);
});

test('rejects foreign fields, invalid slots, invalid recipe and missing provenance',async t=>{
 const {vault}=await fixture(t);
 assert.throws(()=>validateRecipe({filmSimulation:'Provia',arbitrary:'secret'}),/Unknown recipe field/);
 assert.throws(()=>validateRecipe({clarity:Infinity}),/Invalid recipe numeric/);
 assert.throws(()=>validateRecipe({whiteBalanceShift:{red:100,blue:1}}),/Invalid white balance/);
 await assert.rejects(vault.saveSlot('C8',input),/Invalid C1/);
 await assert.rejects(vault.saveSlot('C1',{...input,provenance:{}}),/Invalid provenance/);
 await assert.rejects(vault.saveSlot('C1',{...input,recipe:{filmSimulation:'x\u0000'}}),/Invalid recipe text/);
 assert.throws(()=>validateBackup({format:'unknown',version:1,exportedAt:new Date().toISOString(),slots:{}}),/Unsupported/);
});

test('rejects forged JSON, slot mismatches and oversized input without changing vault',async t=>{
 const {vault}=await fixture(t);await vault.saveSlot('C2',input);const baseline=await vault.read();
 await assert.rejects(vault.importJSON('{"__proto__":{}}'),/Invalid backup|Unsupported/);
 await assert.rejects(vault.importJSON('x'.repeat(1024*1024+1)),/oversized/);
 await assert.rejects(vault.importJSON(JSON.stringify({...baseline,slots:{C1:{...baseline.slots.C2}}})),/Slot key/);
 await assert.rejects(vault.importJSON('{broken'),SyntaxError);
 assert.equal((await vault.read()).slots.C2.recipe.iso,640);
});

test('rejects traversal, symlinked export and imported file, and symlink vault folder',async t=>{
 const {root,vault}=await fixture(t);await vault.saveSlot('C1',input);
 for(const name of ['../escape.json','../../escape.json','/tmp/escape.json','a\\b.json','..json','a/../b.json']){
  await assert.rejects(vault.exportFile(name),/Unsafe backup filename/);await assert.rejects(vault.importFile(name),/Unsafe backup filename/);
 }
 await fs.writeFile(path.join(root,'outside.json'),'outside');
 await fs.symlink(path.join(root,'outside.json'),path.join(root,'vault','poison.json'));
 await assert.rejects(vault.importFile('poison.json'),/Unsafe or oversized vault file/);
 await assert.rejects(vault.exportFile('poison.json'),/Unsafe export target/);
 const linked=new CameraProfileVault({folder:path.join(root,'linked')});await fs.symlink(path.join(root,'vault'),path.join(root,'linked'));
 await assert.rejects(linked.read(),/Unsafe symlink/);
});

test('rejects symlinked canonical vault data and keeps exterior untouched',async t=>{
 const {root,vault}=await fixture(t);await vault.read();const exterior=path.join(root,'outside.json');await fs.writeFile(exterior,'untouched');
 await fs.symlink(exterior,path.join(root,'vault','camera-profile-vault.json'));
 await assert.rejects(vault.read(),/Unsafe or oversized vault file/);
 await assert.rejects(vault.saveSlot('C1',input),/Unsafe or oversized vault file/);
 assert.equal(await fs.readFile(exterior,'utf8'),'untouched');
});

test('diff exposes changes without mutating either snapshot',()=>{
 const a={slot:'C7',name:input.name,recipe:input.recipe,provenance:input.provenance,capturedAt:'2026-11-02T19:00:00.000Z'};
 const b={...a,name:'Updated',recipe:{...a.recipe,iso:1600}};
 const differences=diffSnapshots(a,b);assert.deepEqual(differences.map(x=>x.field),['name','recipe.iso']);assert.equal(a.recipe.iso,640);
});
