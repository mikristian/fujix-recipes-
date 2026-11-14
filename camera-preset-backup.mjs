/** Durable, immutable backup of *camera-read* X100VI C1-C7 PTP properties.
 * The browser owns USB; this module validates and preserves raw property bytes.
 * These backups are not a replacement for an official X Acquire full backup.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const FORMAT='fujix-camera-ptp-presets';
const PROP_MIN=0xD18E,PROP_MAX=0xD1A5;
const hex=value=>typeof value==='string'&&value.length>=2&&value.length<=128&&value.length%2===0&&/^[0-9a-f]+$/.test(value);
const string=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=msg=>{throw new Error(msg)};

export function validateCameraPresetSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('Invalid camera backup object');
 if(snapshot.format!==FORMAT||snapshot.version!==1)fail('Unsupported camera backup format');
 if(!snapshot.camera||snapshot.camera.model!=='X100VI'||snapshot.camera.usbVendorId!==0x04cb||snapshot.camera.usbProductId!==0x0305)fail('Only a verified X100VI PTP device is accepted');
 if(!string(snapshot.camera.serial,128)||!string(snapshot.camera.firmware,64))fail('Camera serial and firmware are required');
 if(!Number.isInteger(snapshot.originalSlot)||snapshot.originalSlot<1||snapshot.originalSlot>7)fail('Original camera slot is missing');
 if(!string(snapshot.capturedAt,48)||!Number.isFinite(Date.parse(snapshot.capturedAt)))fail('Invalid capture date');
 if(!Array.isArray(snapshot.slots)||snapshot.slots.length!==7)fail('A complete seven-slot backup is required');
 for(let i=0;i<7;i++){
  const slot=snapshot.slots[i];
  if(!slot||slot.slot!==i+1||!string(slot.name,100))fail('Camera slot name or sequence invalid');
  if(!Array.isArray(slot.properties)||slot.properties.length<18||slot.properties.length>24)fail(`C${i+1} is incomplete`);
  const ids=new Set();
  for(const prop of slot.properties){
   if(!prop||!Number.isInteger(prop.id)||prop.id<PROP_MIN||prop.id>PROP_MAX||!hex(prop.hex)||ids.has(prop.id))fail(`C${i+1} has an invalid PTP property`);
   ids.add(prop.id);
  }
  const film=slot.properties.find(prop=>prop.id===0xD192);
  if(!film||film.hex.length!==4)fail(`C${i+1} has no valid film simulation bytes`);
 }
 return snapshot;
}

async function ensureDir(root){
 const base=path.resolve(root);
 await fsp.mkdir(base,{recursive:true,mode:0o700});
 const stat=await fsp.lstat(base);
 if(!stat.isDirectory()||stat.isSymbolicLink())fail('Unsafe backup directory');
 return base;
}

export async function saveCameraPresetBackup(snapshot,{root}){
 validateCameraPresetSnapshot(snapshot);
 const dest=await ensureDir(root);
 const id=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z-')+crypto.randomBytes(5).toString('hex');
 const bytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n','utf8');
 if(bytes.length>128*1024)fail('Camera backup exceeds expected size');
 const digest=sha256(bytes);
 const file=path.join(dest,id+'.json');
 await fsp.writeFile(file,bytes,{flag:'wx',mode:0o600});
 const persisted=await fsp.readFile(file);
 if(sha256(persisted)!==digest)fail('Camera backup readback integrity check failed');
 return {ok:true,id,sha256:digest,bytes:bytes.length,slots:7,cameraModel:'X100VI',capturedAt:snapshot.capturedAt,stored:true,note:'All seven raw PTP slot snapshots were saved and verified on this Mac. This is not a complete camera-settings image.'};
}

export async function verifyCameraPresetBackup({root,id,sha256:expected}){
 if(typeof id!=='string'||!/^20\d{6}T\d{6}Z-[a-f0-9]{10}$/.test(id)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))fail('Invalid camera backup receipt');
 const folder=path.resolve(root),file=path.join(folder,id+'.json');
 const stat=await fsp.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)fail('Backup file is missing, changed or unsafe');
 const contents=await fsp.readFile(file);
 if(sha256(contents)!==expected)fail('Saved camera backup checksum mismatch');
 const backup=JSON.parse(contents.toString('utf8'));
 validateCameraPresetSnapshot(backup);
 return {ok:true,verified:true,id,sha256:expected,bytes:stat.size,camera:backup.camera,slots:backup.slots.length};
}
