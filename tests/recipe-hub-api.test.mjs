import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {RecipeHubStore} from '../recipe-hub-store.mjs';
import {intakeRecipeUrl,parseRecipeArticle,validatePublicUrl,resolvePublicHost,createPinnedLookup} from '../recipe-hub-intake.mjs';

const html=`<!doctype html><html><head><title>Example recipe</title>
<meta property="og:title" content="Classic Negative Film Recipe">
<meta name="author" content="Photographer A">
<meta property="og:description" content="A warm film-inspired rendering with deep contrast and a relaxed color palette. The recipe is designed for daylight photography.">
<meta property="og:image" content="https://fujixweekly.com/example.jpg"></head>
<body><h1>Classic Negative Film Recipe</h1>
<p>The recipe came from experiments with muted colors and classic analogue film during a summer photo project.</p>
<p>It works well for daylight travel photographs and softer, nostalgic moments.</p>
<p>Film Simulation: Classic Negative</p><p>Dynamic Range: DR400</p>
<p>Color: +2</p><p>Clarity: -3</p>
</body></html>`;
const publicLookup=async()=>[{address:'104.21.20.8',family:4}];

test('pinned HTTPS DNS lookup supports Node autoSelectFamily all:true',async()=>{
 const pinned=createPinnedLookup({address:'104.21.20.8',family:4});
 const all=await new Promise((resolve,reject)=>pinned('fujixweekly.com',{all:true},(error,records)=>error?reject(error):resolve(records)));
 assert.deepEqual(all,[{address:'104.21.20.8',family:4}]);
 const single=await new Promise((resolve,reject)=>pinned('fujixweekly.com',{},(error,address,family)=>error?reject(error):resolve({address,family})));
 assert.deepEqual(single,{address:'104.21.20.8',family:4});
 assert.throws(()=>createPinnedLookup({address:'127.0.0.1',family:6}),/Invalid pinned DNS/);
});

test('article parse retains source credit and explicit settings',()=>{
 const item=parseRecipeArticle(html,'https://fujixweekly.com/2026/example/');
 assert.equal(item.title,'Classic Negative Film Recipe');
 assert.equal(item.author,'Photographer A');
 assert.equal(item.sourceUrl,'https://fujixweekly.com/2026/example/');
 assert.match(item.summary,/warm film-inspired/);
 assert.match(item.background,/experiments/);
 assert.equal(item.imageUrl,'https://fujixweekly.com/example.jpg');
 assert.equal(item.settings.filmSimulation,'Classic Negative');
 assert.equal(item.settings.clarity,'-3');
 assert.equal(item.settings.color,'+2');
 assert.equal(item.settings.whiteBalance,undefined);
});

test('recipe colors come from explicit article labels, never CSS declarations',()=>{
 const source=html.replace('<title>Example recipe</title>','<title>Example recipe</title><style>\nColor: #ffffff;\n</style>')
  .replace('<p>Color: +2</p>','<p>Color: +4</p>');
 const parsed=parseRecipeArticle(source,'https://fujixweekly.com/recipe/');
 assert.equal(parsed.settings.color,'+4');
 const noSetting=source.replace('<p>Color: +4</p>','');
 assert.equal(parseRecipeArticle(noSetting,'https://fujixweekly.com/recipe/').settings.color,undefined);
});

test('intake validates redirect targets at every hop',async()=>{
 const visited=[];
 const fetchImpl=async url=>{
  visited.push(url);
  return visited.length===1?{status:302,headers:{location:'https://fujixweekly.com/final'}}:{status:200,headers:{'content-type':'text/html'},body:html};
 };
 const result=await intakeRecipeUrl('https://fujixweekly.com/first',{fetchImpl,lookup:publicLookup});
 assert.equal(result.recipe.sourceUrl,'https://fujixweekly.com/final');
 assert.equal(visited.length,2);
});

test('blocks local destinations, DNS to private networks, redirect SSRF and oversized responses',async()=>{
 for(const url of ['http://fujixweekly.com/post','https://localhost/','https://127.0.0.1/a','https://[::1]/','https://192.168.1.2/a','https://service.internal/a','https://user:secret@fujixweekly.com/a','https://fujixweekly.com:8443/a']){
  assert.throws(()=>validatePublicUrl(url));
 }
 await assert.rejects(resolvePublicHost('fujixweekly.com',{lookup:async()=>[{address:'169.254.169.254',family:4}]}),/Private or reserved/);
 await assert.rejects(resolvePublicHost('fujixweekly.com',{lookup:async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.2',family:4}]}),/Private or reserved/);
 await assert.rejects(intakeRecipeUrl('https://fujixweekly.com/start',{lookup:publicLookup,fetchImpl:async()=>({status:301,headers:{location:'http://169.254.169.254/'}})}),/Only public HTTPS/);
 await assert.rejects(intakeRecipeUrl('https://fujixweekly.com/start',{lookup:publicLookup,fetchImpl:async()=>({status:200,headers:{'content-type':'application/json'},body:'{}'})}),/not an HTML/);
 await assert.rejects(intakeRecipeUrl('https://fujixweekly.com/start',{lookup:publicLookup,fetchImpl:async()=>({status:200,headers:{'content-type':'text/html'},body:'x'.repeat(3000)}),maxBytes:1024}),/size limit/);
});

test('staged store survives restart; deduplicates, deletes and protects original catalog',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'recipe-hub-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const filePath=path.join(directory,'staged.json');
 const store=new RecipeHubStore({filePath});
 const parsed=parseRecipeArticle(html,'https://fujixweekly.com/recipe/');
 assert.deepEqual(await store.list(),{recipes:[]});
 const {recipe}=await store.add(parsed);
 assert.equal((await store.add(parsed)).recipe.id,recipe.id);
 const second=new RecipeHubStore({filePath});
 assert.equal((await second.list()).recipes.length,1);
 assert.deepEqual(await second.remove(recipe.id),{ok:true});
 assert.deepEqual(await store.list(),{recipes:[]});
 await assert.rejects(store.remove(recipe.id),/not found/);
});
