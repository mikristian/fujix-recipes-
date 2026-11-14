import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {RecipeHubStore} from '../recipe-hub-store.mjs';
import {RecipeBackupRestore,validateRecipeBackup} from '../recipe-backup-restore.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-recipe-backup-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const filePath=path.join(root,'staged.json');
 return {root,filePath,store:new RecipeHubStore({filePath}),backup:new RecipeBackupRestore({filePath})};
}
const recipe=(title,url)=>({title,sourceUrl:url,settings:{filmSimulation:'Classic Chrome',clarity:'-2'}});

test('portable export roundtrip, non-destructive restore and audit',async t=>{
 const first=await fixture(t);
 const saved=(await first.store.add(recipe('Daylight','https://example.com/daylight'))).recipe;
 const json=await first.backup.exportJSON();
 const second=await fixture(t);
 const secondExisting=(await second.store.add(recipe('Existing','https://example.com/existing'))).recipe;
 const preview=await second.backup.restoreJSON(json,{dryRun:true});
 assert.deepEqual([preview.added,preview.existing,preview.finalCount,preview.applied],[1,1,2,false]);
 assert.equal((await second.store.list()).recipes.length,1);
 const applied=await second.backup.restoreJSON(json);
 assert.equal(applied.added,1);
 assert.deepEqual((await second.store.list()).recipes.map(r=>r.id),[saved.id,secondExisting.id]);
 const repeat=await second.backup.restoreJSON(json);
 assert.equal(repeat.added,0);
 assert.deepEqual(repeat.skipped,[{id:saved.id,reason:'existing-id'}]);
 assert.equal((await second.store.list()).recipes.length,2);
});

test('source URL collision preserves original record; invalid JSON cannot alter storage',async t=>{
 const {backup,store,filePath}=await fixture(t);
 const original=(await store.add(recipe('Original','https://example.com/one'))).recipe;
 const document=JSON.parse(await backup.exportJSON());
 const collision={...original,id:'b'.repeat(8)+'-bbbb-bbbb-bbbb-'+ 'b'.repeat(12),title:'Conflict'};
 const changed={...document,recipes:[collision]};
 const before=await fs.readFile(filePath,'utf8');
 const result=await backup.restoreJSON(JSON.stringify(changed));
 assert.equal(result.skipped[0].reason,'existing-source-url');
 assert.equal(await fs.readFile(filePath,'utf8'),before);
 for(const bad of [
  {...document,version:2},
  {...document,unexpected:1},
  {...document,recipes:[original,original]},
  {...document,recipes:[{...original,settings:{privateCommand:'100'}}]},
  {...document,recipes:[{...original,title:'bad\u0000'}]},
  {...document,recipes:[{...original,sourceUrl:'http://localhost'}]},
  {...document,recipes:[{...original,createdAt:'not a date'}]},
 ]){
  assert.throws(()=>validateRecipeBackup(bad));
  await assert.rejects(backup.restoreJSON(JSON.stringify(bad)));
 }
 await assert.rejects(backup.restoreJSON('x'.repeat(2*1024*1024+1)),/oversized/);
 await assert.rejects(backup.restoreJSON('{broken'),SyntaxError);
 assert.equal(await fs.readFile(filePath,'utf8'),before);
});

test('full merge fails atomically and preserves stored records',async t=>{
 const {backup,store,filePath}=await fixture(t);
 await store.add(recipe('Stored','https://example.com/stored'));
 const document=JSON.parse(await backup.exportJSON());
 const source=document.recipes[0];
 document.recipes=Array.from({length:500},(_,i)=>({...source,id:`${i.toString(16).padStart(8,'0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,sourceUrl:`https://example.com/${i}`}));
 const before=await fs.readFile(filePath,'utf8');
 await assert.rejects(backup.restoreJSON(JSON.stringify(document)),/storage limit/);
 assert.equal(await fs.readFile(filePath,'utf8'),before);
});

test('symlinked stored target and oversized backups are rejected',async t=>{
 const {root,filePath,backup}=await fixture(t);
 const outside=path.join(root,'outside.json');
 await fs.writeFile(outside,'safe');
 await fs.symlink(outside,filePath);
 await assert.rejects(backup.exportJSON(),/Unsafe/);
 const empty={format:'fujix-sync-local-recipes',version:1,exportedAt:new Date().toISOString(),recipes:[]};
 await assert.rejects(backup.restoreJSON(JSON.stringify(empty)),/Unsafe/);
 assert.equal(await fs.readFile(outside,'utf8'),'safe');
});
