/** Offline, JSON-only Fujifilm C1–C7 recipe snapshots. No camera I/O. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const CAMERA_SLOTS=Object.freeze(['C1','C2','C3','C4','C5','C6','C7']);
export const VAULT_FORMAT='fujix-offline-camera-recipes';
export const VAULT_VERSION=1;
const MAX_JSON_BYTES=1024*1024;
const KEYS=new Set(['filmSimulation','dynamicRange','grainEffect','colorChromeEffect','colorChromeFxBlue','whiteBalance','whiteBalanceShift','highlightTone','shadowTone','color','sharpness','noiseReduction','clarity','iso','notes']);
const SOURCE_TYPES=new Set(['manual','camera-transcription','documented-reference']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const validText=(v,n=256)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const stamp=()=>new Date().toISOString();

export function validateRecipe(recipe){
 assert(plain(recipe),'Recipe must be a plain object');
 const output={};
 for(const [key,value] of Object.entries(recipe)){
  assert(KEYS.has(key),'Unknown recipe field: '+key);
  if(key==='whiteBalanceShift'){
   assert(plain(value)&&Object.keys(value).length===2&&Number.isInteger(value.red)&&Number.isInteger(value.blue)&&Math.abs(value.red)<=9&&Math.abs(value.blue)<=9,'Invalid white balance shift');
   output[key]={red:value.red,blue:value.blue};
  }else if(key==='iso'){
   assert(Number.isInteger(value)&&value>=80&&value<=102400,'Invalid ISO');output[key]=value;
  }else if(['highlightTone','shadowTone','color','sharpness','noiseReduction','clarity'].includes(key)){
   assert(typeof value==='number'&&Number.isFinite(value)&&value>=-9&&value<=9,'Invalid recipe numeric field: '+key);output[key]=value;
  }else{
   assert(validText(value,key==='notes'?2000:100),'Invalid recipe text field: '+key);output[key]=value;
  }
 }
 assert(Object.keys(output).length>0,'Recipe must contain a setting');
 return output;
}

export function validateSnapshot(snapshot){
 assert(plain(snapshot),'Snapshot must be an object');
 assert(Object.keys(snapshot).every(k=>['slot','name','recipe','provenance','capturedAt'].includes(k)),'Unknown snapshot field');
 assert(CAMERA_SLOTS.includes(snapshot.slot),'Invalid C1–C7 slot');
 assert(validText(snapshot.name,100),'Invalid snapshot name');
 assert(typeof snapshot.capturedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(snapshot.capturedAt)&&!Number.isNaN(Date.parse(snapshot.capturedAt)),'Invalid capture timestamp');
 assert(plain(snapshot.provenance),'Provenance is required');
 assert(Object.keys(snapshot.provenance).every(k=>['type','description','source','cameraModel'].includes(k)),'Unknown provenance field');
 assert(SOURCE_TYPES.has(snapshot.provenance.type)&&validText(snapshot.provenance.description,1000),'Invalid provenance');
 for(const key of ['source','cameraModel'])if(own(snapshot.provenance,key))assert(validText(snapshot.provenance[key],500),'Invalid provenance '+key);
 return {slot:snapshot.slot,name:snapshot.name,recipe:validateRecipe(snapshot.recipe),provenance:{...snapshot.provenance},capturedAt:snapshot.capturedAt};
}

export function validateBackup(backup){
 assert(plain(backup)&&Object.keys(backup).every(k=>['format','version','exportedAt','slots'].includes(k)),'Invalid backup object');
 assert(backup.format===VAULT_FORMAT&&backup.version===VAULT_VERSION,'Unsupported backup format or version');
 assert(typeof backup.exportedAt==='string'&&!Number.isNaN(Date.parse(backup.exportedAt)),'Invalid export timestamp');
 assert(plain(backup.slots)&&Object.keys(backup.slots).every(s=>CAMERA_SLOTS.includes(s)),'Invalid slot map');
 const slots={};
 for(const [slot,snapshot] of Object.entries(backup.slots)){
  assert(snapshot===null||plain(snapshot),'Invalid slot contents');
  slots[slot]=snapshot===null?null:validateSnapshot(snapshot);
  if(slots[slot])assert(slots[slot].slot===slot,'Slot key/snapshot mismatch');
 }
 return {format:VAULT_FORMAT,version:VAULT_VERSION,exportedAt:backup.exportedAt,slots:Object.fromEntries(CAMERA_SLOTS.map(s=>[s,own(slots,s)?slots[s]:null]))};
}

export function diffSnapshots(before,after){
 const a=before===null?null:validateSnapshot(before),b=after===null?null:validateSnapshot(after);
 const changes=[];
 function walk(left,right,field){
  if(plain(left)||plain(right)){
   const keys=new Set([...Object.keys(plain(left)?left:{}),...Object.keys(plain(right)?right:{})]);
   for(const key of [...keys].sort())walk(plain(left)?left[key]:undefined,plain(right)?right[key]:undefined,field?`${field}.${key}`:key);
  }else if(!Object.is(left,right))changes.push({field,before:left??null,after:right??null});
 }
 walk(a,b,'');return changes;
}

export class CameraProfileVault {
 constructor({folder}={}){
  assert(typeof folder==='string'&&path.isAbsolute(folder)&&!folder.includes('\0'),'Caller must supply an absolute vault folder');
  this.folder=path.resolve(folder);this.filename='camera-profile-vault.json';
 }
 async #prepare(){
  // Resolve system aliases (macOS /var -> /private/var), but reject
  // symlinks anywhere in the user-controlled folder hierarchy.
  const missing=[];let existing=this.folder;
  for(;;){
   try{await fs.lstat(existing);break}
   catch(e){if(e.code!=='ENOENT')throw e;missing.unshift(path.basename(existing));const parent=path.dirname(existing);assert(parent!==existing,'Invalid vault directory');existing=parent}
  }
  let current=await fs.realpath(existing);
  const segments=missing;
  const original=await fs.lstat(existing);
  assert(original.isDirectory()&&!original.isSymbolicLink(),'Unsafe symlink or non-directory in vault path');
  for(const segment of segments){
   current=path.join(current,segment);
   try{const s=await fs.lstat(current);assert(s.isDirectory()&&!s.isSymbolicLink(),'Unsafe symlink or non-directory in vault path');}
   catch(e){if(e.code!=='ENOENT')throw e;await fs.mkdir(current,{mode:0o700});}
  }
  this.folder=current;
  return current;
 }
 async #readFile(file){
  const s=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e});
  if(!s)return null;
  assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=MAX_JSON_BYTES,'Unsafe or oversized vault file');
  const handle=await fs.open(file, 'r',0o600);
  try{
   const stat=await handle.stat();assert(stat.isFile()&&stat.size<=MAX_JSON_BYTES,'Unsafe vault file');
   const data=await handle.readFile('utf8');assert(Buffer.byteLength(data)<=MAX_JSON_BYTES,'Oversized backup');
   return validateBackup(JSON.parse(data));
  }finally{await handle.close()}
 }
 async #atomicWrite(file,backup){
  const serialized=JSON.stringify(validateBackup(backup),null,2)+'\n';
  assert(Buffer.byteLength(serialized)<=MAX_JSON_BYTES,'Backup exceeds size limit');
  const target=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e});
  assert(!target||(target.isFile()&&!target.isSymbolicLink()),'Unsafe target file');
  const temporary=path.join(this.folder,`.fujix-vault-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temporary,'wx',0o600);
  try{await handle.writeFile(serialized);await handle.sync();await handle.close();await fs.rename(temporary,file);
   const dir=await fs.open(this.folder,'r');try{await dir.sync()}finally{await dir.close()}
  }catch(e){await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw e}
 }
 async read(){await this.#prepare();return (await this.#readFile(path.join(this.folder,this.filename)))??this.emptyBackup()}
 emptyBackup(){return {format:VAULT_FORMAT,version:VAULT_VERSION,exportedAt:stamp(),slots:Object.fromEntries(CAMERA_SLOTS.map(s=>[s,null]))}}
 async saveSlot(slot,{name,recipe,provenance,capturedAt=stamp()}={}){
  assert(CAMERA_SLOTS.includes(slot),'Invalid C1–C7 slot');
  const snapshot=validateSnapshot({slot,name,recipe,provenance,capturedAt});
  const backup=await this.read();const changes=diffSnapshots(backup.slots[slot],snapshot);
  backup.slots[slot]=snapshot;backup.exportedAt=stamp();await this.#atomicWrite(path.join(this.folder,this.filename),backup);
  return {snapshot,changes};
 }
 async clearSlot(slot){
  assert(CAMERA_SLOTS.includes(slot),'Invalid C1–C7 slot');const backup=await this.read();const changes=diffSnapshots(backup.slots[slot],null);
  backup.slots[slot]=null;backup.exportedAt=stamp();await this.#atomicWrite(path.join(this.folder,this.filename),backup);return changes;
 }
 async exportJSON(){return JSON.stringify(await this.read(),null,2)+'\n'}
 async importJSON(input,{dryRun=false}={}){
  assert(typeof input==='string'&&Buffer.byteLength(input)<=MAX_JSON_BYTES,'Invalid or oversized JSON backup');
  const incoming=validateBackup(JSON.parse(input));const previous=await this.read();
  const diff=Object.fromEntries(CAMERA_SLOTS.map(s=>[s,diffSnapshots(previous.slots[s],incoming.slots[s])]));
  if(!dryRun){incoming.exportedAt=stamp();await this.#atomicWrite(path.join(this.folder,this.filename),incoming)}
  return {diff,applied:!dryRun};
 }
 async exportFile(filename='camera-profile-backup.json'){
  const target=this.#safeName(filename);await this.#prepare();
  assert(target!==this.filename,'Backup destination conflicts with live vault');
  const serialized=await this.exportJSON();const temporary=path.join(this.folder,`.fujix-export-${crypto.randomUUID()}.tmp`);
  const handle=await fs.open(temporary,'wx',0o600);
  try{await handle.writeFile(serialized);await handle.sync();await handle.close();
   const s=await fs.lstat(path.join(this.folder,target)).catch(e=>{if(e.code==='ENOENT')return null;throw e});
   assert(!s||(s.isFile()&&!s.isSymbolicLink()),'Unsafe export target');
   await fs.rename(temporary,path.join(this.folder,target));return path.join(this.folder,target);
  }catch(e){await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw e}
 }
 async importFile(filename,{dryRun=false}={}){
  await this.#prepare();const input=await this.#readFile(path.join(this.folder,this.#safeName(filename)));
  assert(input!==null,'Backup file not found');return this.importJSON(JSON.stringify(input),{dryRun});
 }
 #safeName(name){assert(typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.json$/.test(name)&&!name.includes('..')&&!path.isAbsolute(name),'Unsafe backup filename');return name}
}
