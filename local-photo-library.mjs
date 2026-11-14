/** Native, local-Finder-backed FujiX Sync photo archive.
 * USB Webcam frames are saved as 1920x1080-ish PREVIEW JPEGs (not SD originals).
 * Genuine originals arrive only when the user explicitly imports the files.
 * Never writes to camera, erases media, uses iCloud, or changes USB modes.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';

const MAX_PREVIEW=12*1024*1024;
const MAX_ORIGINAL=200*1024*1024;
const ALLOWED=new Set(['jpg','jpeg','raf','png','heic','heif','tif','tiff']);
const MIME={jpg:'image/jpeg',jpeg:'image/jpeg',raf:'application/octet-stream',png:'image/png',heic:'image/heic',heif:'image/heif',tif:'image/tiff',tiff:'image/tiff'};
function safeUserName(value){const name=path.basename(value||'');return name.replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,85)||'camera-photo'}
function validateImageHeader(bytes,ext){
 if(ext==='jpg'||ext==='jpeg')return bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
 if(ext==='png')return bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(ext==='raf')return bytes.length>32&&bytes.toString('ascii',0,15)==='FUJIFILMCCD-RAW';
 if(ext==='tif'||ext==='tiff')return bytes.length>8&&(bytes.subarray(0,4).equals(Buffer.from([73,73,42,0]))||bytes.subarray(0,4).equals(Buffer.from([77,77,0,42])));
 if(ext==='heic'||ext==='heif')return bytes.length>16&&bytes.toString('ascii',4,8)==='ftyp';
 return false;
}
export class LocalPhotoLibrary {
 constructor({root=path.join(os.homedir(),'Pictures','FujiX Sync'),maxItems=180}={}){
  this.root=path.resolve(root);this.captures=path.join(this.root,'Captures');this.originals=path.join(this.root,'Originals');this.maxItems=maxItems;
 }
 async prepare(){
  await Promise.all([fsp.mkdir(this.captures,{recursive:true,mode:0o700}),fsp.mkdir(this.originals,{recursive:true,mode:0o700})]);
  // macOS commonly maps /var to /private/var and Pictures may be symlinked.
  // Compare resolved absolute paths with resolved canonical folder roots.
  this.root=await fsp.realpath(this.root);
  this.captures=await fsp.realpath(path.join(this.root,'Captures'));
  this.originals=await fsp.realpath(path.join(this.root,'Originals'));
 }
 async write(req,{kind,filename=''}={}){
  const capture=kind==='capture';if(!capture&&kind!=='original')throw Error('Unknown photo-save destination');
  const name=capture?'X100VI-USB-preview.jpg':safeUserName(filename);
  const extension=capture?'jpg':path.extname(name).slice(1).toLowerCase();
  if(!ALLOWED.has(extension))throw Error('Choose a camera photo format: RAF, JPEG, PNG, HEIF/HEIC, or TIFF.');
  const max=capture?MAX_PREVIEW:MAX_ORIGINAL;
  const declared=Number(req.headers['content-length']);
  if(req.headers['content-length'] && (!Number.isSafeInteger(declared)||declared<128||declared>max))throw Error('Photo size exceeds this camera import limit.');
  await this.prepare();
  const id=crypto.randomBytes(12).toString('hex');
  const folder=capture?this.captures:this.originals;
  const savedName=capture?`X100VI-USB-${id}.jpg`:`X100VI-Original-${id}-${name}`;
  const full=path.join(folder,savedName);
  const handle=await fsp.open(full,'wx',0o600);
  let bytes=0;let beginning=Buffer.alloc(0),end=Buffer.alloc(0);
  try{
   for await(const data of req){
    bytes+=data.length;
    if(bytes>max)throw Error('Photo exceeded the maximum file size. No partial photo retained.');
    if(beginning.length<40)beginning=Buffer.concat([beginning,data]).subarray(0,40);
    end=Buffer.concat([end,data]).subarray(-8);
    await handle.write(data);
   }
   if(req.headers['content-length'] && bytes!==declared)throw Error('Camera photo transfer was incomplete. Partial file was discarded.');
   if(bytes<128)throw Error('Camera photo was empty or incomplete.');
   const signature=Buffer.concat([beginning,end]);
   // JPEG end-marker must be at end of stream, not appended inside header.
   if(extension==='jpg'||extension==='jpeg'){
    if(beginning[0]!==0xff||beginning[1]!==0xd8||end.at(-2)!==0xff||end.at(-1)!==0xd9)throw Error('Photo was not a valid JPEG bitstream.');
   } else if(!validateImageHeader(signature,extension))throw Error('Camera file header does not match its declared format.');
   await handle.sync();await handle.close();
   const stat=await fsp.stat(full);
   return {id,kind:capture?'usb-preview':'imported-original',name:capture?savedName:name,savedName,bytes:stat.size,createdAt:stat.mtimeMs,mime:MIME[extension],isOriginal:!capture,folder:folder,previewUrl:MIME[extension].startsWith('image/')?`/api/usb/photos/file/${id}?preview=1`:null,fileUrl:`/api/usb/photos/file/${id}`};
  }catch(error){await handle.close().catch(()=>{});await fsp.unlink(full).catch(()=>{});throw error}
 }
 async list(){
  await this.prepare();
  const output=[];
  for(const [folder,kind] of [[this.captures,'usb-preview'],[this.originals,'imported-original']]){
   const entries=await fsp.readdir(folder,{withFileTypes:true});
   for(const entry of entries.slice(0,2000)){
    if(!entry.isFile()||entry.isSymbolicLink())continue;
    const match=(kind==='usb-preview'? /^X100VI-USB-([a-f0-9]{24})\.jpg$/:/^X100VI-Original-([a-f0-9]{24})-(.+)\.([a-z0-9]+)$/i).exec(entry.name);
    if(!match)continue;
    const id=match[1];const ext=path.extname(entry.name).slice(1).toLowerCase();if(!ALLOWED.has(ext))continue;
    const full=path.join(folder,entry.name);let stat;
    try{stat=await fsp.lstat(full);if(!stat.isFile()||stat.isSymbolicLink())continue;}catch{continue}
    output.push({id,kind,name:kind==='usb-preview'?entry.name:entry.name.replace(/^X100VI-Original-[a-f0-9]{24}-/,''),savedName:entry.name,bytes:stat.size,createdAt:stat.mtimeMs,mime:MIME[ext],isOriginal:kind==='imported-original',previewUrl:ext==='jpg'||ext==='jpeg'||ext==='png'||ext==='heif'||ext==='heic'?`/api/usb/photos/file/${id}?preview=1`:null,fileUrl:`/api/usb/photos/file/${id}`});
   }
  }
  output.sort((a,b)=>b.createdAt-a.createdAt);
  const files=output.slice(0,this.maxItems);
  return {folder:this.root,capturesFolder:this.captures,originalsFolder:this.originals,count:output.length,files,mode:'native-mac-files',note:'USB preview JPEGs are not camera shutter images. Originals require manual card-reader import or another supported transfer.'};
 }
 async file(id){
  if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw Error('Invalid local photo ID.');
  const info=await this.list();const photo=info.files.find(x=>x.id===id);
  if(!photo)throw Error('Photo was not found in the native Mac photo library.');
  const folder=photo.kind==='usb-preview'?this.captures:this.originals;
  const full=path.join(folder,photo.savedName);
  const real=await fsp.realpath(full);
  if(!real.startsWith(folder+path.sep))throw Error('Unsafe photo path.');
  const stat=await fsp.lstat(real);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==photo.bytes)throw Error('Photo changed during access. Refresh library.');
  return {photo,stream:fs.createReadStream(real),size:stat.size};
 }
}
