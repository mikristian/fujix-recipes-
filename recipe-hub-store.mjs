import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {RecipeBackupRestore} from './recipe-backup-restore.mjs';

const MAX_FILE_BYTES=2*1024*1024;
const MAX_RECIPES=500;
const clean=(value,max=2000)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const isPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const ALLOWED_SETTINGS=new Set(['filmSimulation','dynamicRange','grainEffect','colorChromeEffect','colorChromeFxBlue','whiteBalance','whiteBalanceShift','highlight','shadow','color','sharpness','noiseReduction','clarity','iso','exposureCompensation']);

export function normalizeStagedRecipe(value){
 if(!isPlain(value))throw new Error('Recipe must be an object');
 const url=new URL(value.sourceUrl||value.url);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('Recipe source must be HTTPS');
 const title=clean(value.title||value.name,180);
 if(!title)throw new Error('Recipe title is required');
 const settings={};
 if(value.settings!==undefined){
  if(!isPlain(value.settings))throw new Error('Invalid recipe settings');
  for(const [key,val] of Object.entries(value.settings)){
   if(!ALLOWED_SETTINGS.has(key))continue;
   if(typeof val==='string'&&val.trim())settings[key]=clean(val,160);
   else if(typeof val==='number'&&Number.isFinite(val))settings[key]=String(val);
  }
 }
 let imageUrl=null;
 if(typeof value.imageUrl==='string'){
  try{const u=new URL(value.imageUrl);if(u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443'))imageUrl=u.href;}catch{}
 }
 return {id:typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)?value.id:crypto.randomUUID(),title,sourceUrl:url.href,author:clean(value.author,160),summary:clean(value.summary,700),background:clean(value.background,1100),imageUrl,settings,createdAt:new Date().toISOString(),source:'imported'};
}

export class RecipeHubStore{
 constructor({filePath}={}){
  if(typeof filePath!=='string'||!path.isAbsolute(filePath))throw new Error('An absolute staged recipes filePath is required');
  this.filePath=path.resolve(filePath);
  this.queue=Promise.resolve();
  this.backups=new RecipeBackupRestore({filePath:this.filePath});
 }
 async #read(){
  try{
   const stat=await fs.lstat(this.filePath);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)throw new Error('Unsafe staged recipe file');
   const text=await fs.readFile(this.filePath,'utf8');
   if(Buffer.byteLength(text)>MAX_FILE_BYTES)throw new Error('Oversized staged recipe file');
   const doc=JSON.parse(text);
   if(!isPlain(doc)||doc.version!==1||!Array.isArray(doc.recipes)||doc.recipes.length>MAX_RECIPES)throw new Error('Invalid staged recipe file');
   return doc.recipes;
  }catch(error){if(error.code==='ENOENT')return [];throw error;}
 }
 async #write(recipes){
  const folder=path.dirname(this.filePath);
  await fs.mkdir(folder,{recursive:true,mode:0o700});
  const stat=await fs.lstat(folder);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe staged recipe directory');
  const json=JSON.stringify({version:1,recipes},null,2);
  if(Buffer.byteLength(json)>MAX_FILE_BYTES)throw new Error('Staged recipe storage full');
  const tmp=path.join(folder,'.staged-'+crypto.randomUUID()+'.tmp');
  try{
   await fs.writeFile(tmp,json,{flag:'wx',mode:0o600});
   await fs.rename(tmp,this.filePath);
  }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 }
 #serial(operation){
  const next=this.queue.then(operation);
  this.queue=next.catch(()=>{});
  return next;
 }
 async list(){return {recipes:await this.#serial(()=>this.#read())};}
 // The backup operations share our add/remove queue so a restore cannot
 // overwrite concurrent changes in the user's local staged recipe library.
 async exportBackup(){return this.#serial(()=>this.backups.exportJSON());}
 async restoreBackup(backup,{dryRun=true}={}){
  return this.#serial(()=>this.backups.restoreJSON(backup,{dryRun}));
 }
 async add(recipe){return this.#serial(async()=>{
  const recipes=await this.#read(),item=normalizeStagedRecipe(recipe);
  if(recipes.length>=MAX_RECIPES)throw new Error('Staged recipe limit reached');
  const previous=recipes.find(r=>r.sourceUrl===item.sourceUrl);
  if(previous)return {recipe:previous};
  await this.#write([item,...recipes]);return {recipe:item};
 });}
 async remove(id){return this.#serial(async()=>{
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid staged recipe ID');
  const recipes=await this.#read(),remaining=recipes.filter(r=>r.id!==id);
  if(remaining.length===recipes.length)throw new Error('Staged recipe not found');
  await this.#write(remaining);return {ok:true};
 });}
}
export const createRecipeHubStore=options=>new RecipeHubStore(options);
