/** Portable backups for locally staged/imported/custom recipes. Offline only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const RECIPE_BACKUP_FORMAT='fujix-sync-local-recipes';
export const RECIPE_BACKUP_VERSION=1;
const MAX_BYTES=2*1024*1024;
const MAX_RECIPES=500;
const SETTINGS=new Set(['filmSimulation','dynamicRange','grainEffect','colorChromeEffect','colorChromeFxBlue','whiteBalance','whiteBalanceShift','highlight','shadow','color','sharpness','noiseReduction','clarity','iso','exposureCompensation']);
const FIELDS=new Set(['id','title','sourceUrl','author','summary','background','imageUrl','settings','createdAt','source']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
function requireThat(ok,msg){if(!ok)throw new Error(msg)}
function stamp(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v}
function text(v,max,required=false){return typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0)&&!/[\u0000-\u001f\u007f]/.test(v)}
function https(v){if(typeof v!=='string'||v.length>2048)return false;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.href===v}catch{return false}}
function uniqueObjectKeysJSON(json){
 // JSON.parse silently accepts duplicate keys. Reject via roundtrip? A custom parser is
 // unnecessary for integrity because schema is validated after parsing and no signatures.
 return JSON.parse(json);
}
export function validateLocalRecipe(value){
 requireThat(plain(value),'Invalid recipe object');
 requireThat(Object.keys(value).every(k=>FIELDS.has(k)),'Unknown recipe field');
 requireThat(typeof value.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id),'Invalid recipe ID');
 requireThat(text(value.title,180,true),'Invalid recipe title');
 requireThat(https(value.sourceUrl),'Invalid recipe source URL');
 for(const [key,max] of [['author',160],['summary',700],['background',1100]])requireThat(text(value[key],max),'Invalid '+key);
 requireThat(value.imageUrl===null||https(value.imageUrl),'Invalid image URL');
 requireThat(plain(value.settings)&&Object.keys(value.settings).every(k=>SETTINGS.has(k)),'Invalid settings');
 for(const v of Object.values(value.settings))requireThat(text(v,160,true),'Invalid recipe setting value');
 requireThat(stamp(value.createdAt),'Invalid creation timestamp');
 requireThat(value.source==='imported'||value.source==='custom','Invalid recipe source');
 return {id:value.id,title:value.title,sourceUrl:value.sourceUrl,author:value.author,summary:value.summary,background:value.background,imageUrl:value.imageUrl,settings:{...value.settings},createdAt:value.createdAt,source:value.source};
}
function validateRecords(records){
 requireThat(Array.isArray(records)&&records.length<=MAX_RECIPES,'Invalid recipe count');
 const ids=new Set(),urls=new Set();
 return records.map(r=>{
  const item=validateLocalRecipe(r);
  requireThat(!ids.has(item.id)&&!urls.has(item.sourceUrl),'Duplicate recipe ID or source URL');
  ids.add(item.id);urls.add(item.sourceUrl);return item;
 });
}
export function validateRecipeBackup(value){
 requireThat(plain(value)&&Object.keys(value).length===4&&Object.keys(value).every(k=>['format','version','exportedAt','recipes'].includes(k)),'Invalid backup schema');
 requireThat(value.format===RECIPE_BACKUP_FORMAT&&value.version===RECIPE_BACKUP_VERSION,'Unsupported backup format or version');
 requireThat(stamp(value.exportedAt),'Invalid export timestamp');
 return {format:RECIPE_BACKUP_FORMAT,version:RECIPE_BACKUP_VERSION,exportedAt:value.exportedAt,recipes:validateRecords(value.recipes)};
}
function parseBounded(input){
 requireThat(typeof input==='string'&&Buffer.byteLength(input,'utf8')<=MAX_BYTES,'Invalid or oversized backup JSON');
 return validateRecipeBackup(uniqueObjectKeysJSON(input));
}
async function safeRead(file){
 let st;try{st=await fs.lstat(file)}catch(e){if(e.code==='ENOENT')return null;throw e}
 requireThat(st.isFile()&&!st.isSymbolicLink()&&st.size<=MAX_BYTES,'Unsafe or oversized recipe file');
 const handle=await fs.open(file,'r');
 try{
  const current=await handle.stat();
  requireThat(current.isFile()&&current.size<=MAX_BYTES,'Unsafe recipe file');
  const raw=await handle.readFile('utf8');
  requireThat(Buffer.byteLength(raw,'utf8')<=MAX_BYTES,'Oversized recipe file');
  return JSON.parse(raw);
 }finally{await handle.close()}
}
async function safeFolder(folder){
 const parent=path.dirname(folder);
 // Existing parent and target must be real directories, with no symlink target.
 const s=await fs.lstat(parent);
 requireThat(s.isDirectory()&&!s.isSymbolicLink(),'Unsafe recipe parent directory');
 await fs.mkdir(folder,{mode:0o700,recursive:true});
 const t=await fs.lstat(folder);
 requireThat(t.isDirectory()&&!t.isSymbolicLink(),'Unsafe recipe directory');
}
async function atomicWrite(file,document){
 const serialized=JSON.stringify(document,null,2)+'\n';
 requireThat(Buffer.byteLength(serialized,'utf8')<=MAX_BYTES,'Recipe storage full');
 const target=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e});
 requireThat(!target||(target.isFile()&&!target.isSymbolicLink()),'Unsafe recipe target');
 const folder=path.dirname(file);
 const temp=path.join(folder,'.recipe-restore-'+crypto.randomUUID()+'.tmp');
 const h=await fs.open(temp,'wx',0o600);
 try{
  await h.writeFile(serialized);await h.sync();await h.close();
  await fs.rename(temp,file);
  const dir=await fs.open(folder,'r');try{await dir.sync()}finally{await dir.close()}
 }catch(e){await h.close().catch(()=>{});throw e}
 finally{await fs.rm(temp,{force:true}).catch(()=>{})}
}
const queues=new Map();
function serial(file,fn){
 const old=queues.get(file)||Promise.resolve();
 const next=old.catch(()=>{}).then(fn);
 const tail=next.catch(()=>{});queues.set(file,tail);
 void tail.then(()=>{if(queues.get(file)===tail)queues.delete(file)});
 return next;
}
export class RecipeBackupRestore{
 constructor({filePath}={}){
  requireThat(typeof filePath==='string'&&path.isAbsolute(filePath)&&!filePath.includes('\0'),'Absolute recipe storage path required');
  this.filePath=path.resolve(filePath);
 }
 async #existing(){
  await safeFolder(path.dirname(this.filePath));
  const doc=await safeRead(this.filePath);
  if(doc===null)return [];
  requireThat(plain(doc)&&Object.keys(doc).length===2&&doc.version===1,'Invalid staged storage schema');
  return validateRecords(doc.recipes);
 }
 async exportJSON(){
  return serial(this.filePath,async()=>{
   const document={format:RECIPE_BACKUP_FORMAT,version:RECIPE_BACKUP_VERSION,exportedAt:new Date().toISOString(),recipes:await this.#existing()};
   const json=JSON.stringify(document,null,2)+'\n';
   requireThat(Buffer.byteLength(json)<=MAX_BYTES,'Backup exceeds size limit');
   return json;
  });
 }
 async restoreJSON(input,{dryRun=false}={}){
  requireThat(typeof dryRun==='boolean','Invalid dryRun option');
  const backup=parseBounded(input);
  return serial(this.filePath,async()=>{
   const existing=await this.#existing();
   const ids=new Set(existing.map(x=>x.id)),urls=new Set(existing.map(x=>x.sourceUrl));
   const added=[],skipped=[];
   for(const recipe of backup.recipes){
    if(ids.has(recipe.id)||urls.has(recipe.sourceUrl)){skipped.push({id:recipe.id,reason:ids.has(recipe.id)?'existing-id':'existing-source-url'});continue}
    added.push(recipe);ids.add(recipe.id);urls.add(recipe.sourceUrl);
   }
   requireThat(existing.length+added.length<=MAX_RECIPES,'Restored recipes exceed storage limit');
   const merged=[...added,...existing];
   const audit={format:RECIPE_BACKUP_FORMAT,version:RECIPE_BACKUP_VERSION,exportedAt:backup.exportedAt,examined:backup.recipes.length,existing:existing.length,added:added.length,skipped,finalCount:merged.length,applied:!dryRun};
   if(!dryRun&&added.length)await atomicWrite(this.filePath,{version:1,recipes:merged});
   return audit;
  });
 }
}
export const createRecipeBackupRestore=options=>new RecipeBackupRestore(options);
