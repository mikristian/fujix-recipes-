/** Mac-local X100VI UVC JPEG preview library.
 * Data is stored under ~/Pictures/FujiX Sync/USB Live Captures.
 * It is a copy of actual webcam pixels, NEVER an original camera RAF/JPEG.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

export const USB_JPEG_MAX_BYTES = 8 * 1024 * 1024;
const NAME=/^X100VI-USB-\d{8}-\d{6}-[a-f0-9]{12}\.jpg$/;
export const USB_PHOTO_FOLDER = path.join(os.homedir(),'Pictures','FujiX Sync','USB Live Captures');

function validateJPEG(bytes){
  return bytes.length>=128 && bytes.length<=USB_JPEG_MAX_BYTES &&
  bytes[0]===0xff && bytes[1]===0xd8 && bytes.at(-2)===0xff && bytes.at(-1)===0xd9;
}
function formatName(when){
  const utc=when.toISOString().replace(/[-:]/g,'');
  return `X100VI-USB-${utc.slice(0,8)}-${utc.slice(9,15)}-${randomBytes(6).toString('hex')}.jpg`;
}
export class USBPhotoLibrary {
  constructor(folder=USB_PHOTO_FOLDER){this.folder=folder}
  async save(data,{now=new Date()}={}){
    const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
    if(!validateJPEG(bytes)) throw Error('Invalid or oversized USB JPEG. No file was saved.');
    await fsp.mkdir(this.folder,{recursive:true,mode:0o700});
    for(let attempt=0;attempt<3;attempt++){
      const name=formatName(now);
      try{
        await fsp.writeFile(path.join(this.folder,name),bytes,{flag:'wx',mode:0o600});
        return {name,bytes:bytes.length,createdAt:now.toISOString(),source:'usb-webcam-preview',isOriginal:false,raf:false};
      }catch(error){if(error.code==='EEXIST')continue;throw error}
    }
    throw Error('Cannot reserve a unique camera-preview filename.');
  }
  async list({max=120}={}){
    let names=[];
    try{names=await fsp.readdir(this.folder)}catch(error){if(error.code==='ENOENT')return {folder:this.folder,photos:[],count:0};throw error}
    names=names.filter(name=>NAME.test(name)).sort().reverse();
    const photos=[];
    for(const name of names.slice(0,max)){
      const full=path.join(this.folder,name);
      const stat=await fsp.lstat(full).catch(()=>null);
      if(!stat?.isFile()||stat.isSymbolicLink()||stat.size<128||stat.size>USB_JPEG_MAX_BYTES)continue;
      photos.push({name,bytes:stat.size,createdAt:stat.birthtime.toISOString(),source:'usb-webcam-preview',isOriginal:false,raf:false,url:`/api/usb-captures/${name}`});
    }
    return {folder:this.folder,photos,count:photos.length};
  }
  async file(name){
    if(!NAME.test(String(name)))throw Error('Invalid local camera-preview filename.');
    const full=path.join(this.folder,name);
    const stat=await fsp.lstat(full);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<128||stat.size>USB_JPEG_MAX_BYTES)throw Error('Camera preview not found.');
    return {name,bytes:stat.size,stream:fs.createReadStream(full)};
  }
}
export function checkUsbPreviewJPEG(bytes){return validateJPEG(bytes)}
