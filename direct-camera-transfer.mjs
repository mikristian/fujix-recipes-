/** Local X100VI XApp-gallery auto-import state machine.
 * Camera I/O is injected to keep testing independent of camera hardware.
 * Does not wake the camera, shoot, modify SD contents, or claim liveview works.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_FILE=128*1024*1024;
const MAX_PER_SCAN=4;
const DEFAULT_POLL=4000;
const EXT=/\.(?:JPE?G|PNG|HEIF|HEIC|RAF|TIF|TIFF)$/i;

export function validCameraEntry(value){
  return Boolean(value&&Number.isInteger(value.handle)&&value.handle>0&&value.handle<=0xffffffff&&
    typeof value.name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(value.name)&&EXT.test(value.name)&&
    Number.isSafeInteger(value.bytes)&&value.bytes>=128&&value.bytes<=MAX_FILE);
}
export function cameraEntryKey(item){return `${item.name.toUpperCase()}\u0000${item.bytes}\u0000${item.handle}`;}

export class DirectCameraTransfer {
  constructor({list,download,ready,destination,pollMs=DEFAULT_POLL,clock=()=>Date.now(),unavailableMessage='Connect the Mac to the X100VI direct camera Wi-Fi and stop live view before enabling auto-import.',modeNote='Experimental X100VI direct Wi-Fi gallery: no camera file is fetched until the camera is identified, the native gallery is accessible, and new captures appear after the initial baseline. Live view cannot run concurrently.'}={}){
    if(![list,download,ready].every(f=>typeof f==='function'))throw Error('Camera listing, download and readiness checks are required.');
    this.list=list;this.download=download;this.ready=ready;
    this.destination=destination;this.pollMs=Math.max(2000,Math.min(30000,pollMs));this.clock=clock;this.unavailableMessage=unavailableMessage;this.modeNote=modeNote;
    this.active=false;this.state='off';this.error=null;this.since=null;this.lastScan=null;
    this.files=[];this.baseline=new Set();this.completed=new Set();this.timer=null;this.pending=null;this.starting=false;
    this.attempts=new Map();this.imported=0;this.lastTransfer=null;this.generation=0;
  }
  status(){return {active:this.active,starting:this.starting,state:this.state,error:this.error,since:this.since,lastScan:this.lastScan,
    imported:this.imported,lastTransfer:this.lastTransfer,destination:this.destination,
    files:[...this.files],pollSeconds:this.pollMs/1000,
    note:this.modeNote};}
  async start(){
    if(this.active)return this.status();
    if(this.pending||this.starting)throw Error('Another gallery operation is already in progress.');
    this.starting=true;const generation=++this.generation;
    try{
      const ok=await this.ready();if(ok!==true)throw Error(this.unavailableMessage);
      this.state='baseline';this.error=null;
      const gallery=await this.list();
      if(!gallery||gallery.verified!==true||!Array.isArray(gallery.items))throw Error('A verified X100VI gallery listing is required before auto-import.');
      if(this.generation!==generation)throw Error('Camera transfer monitoring was stopped during initialization.');
      this.baseline=new Set(gallery.items.filter(validCameraEntry).map(cameraEntryKey));
      this.completed.clear();this.attempts.clear();
      this.active=true;this.state='watching';this.since=this.clock();this.lastScan=this.clock();this.imported=0;this.files=[];
      this.schedule(generation);
      return this.status();
    }catch(e){
      if(this.generation===generation){this.state='off';this.error=String(e?.message||e).slice(0,180)}
      throw e;
    }finally{
      this.starting=false;
    }
  }
  async stop(){
    this.active=false;this.state='off';this.generation++;
    if(this.timer){clearTimeout(this.timer);this.timer=null}
    if(this.pending)await this.pending;
    return this.status();
  }
  schedule(generation){
    if(!this.active||generation!==this.generation)return;
    this.timer=setTimeout(async()=>{
      this.timer=null;
      try{await this.scan();}catch(e){if(this.active){this.state='paused';this.error=String(e?.message||e).slice(0,180)}}
      if(this.active&&generation===this.generation)this.schedule(generation);
    },this.pollMs);
    this.timer.unref?.();
  }
  async scan(){
    if(!this.active)return this.status();
    if(this.pending)return this.pending;
    const job=this.scanInternal();this.pending=job;
    try{return await job}finally{if(this.pending===job)this.pending=null}
  }
  async scanInternal(){
    if(await this.ready()!==true)throw Error('Camera Wi-Fi/gallery unavailable or live view is active. Auto-import is paused; no photo was downloaded.');
    const gallery=await this.list();
    if(gallery?.verified!==true||!Array.isArray(gallery.items))throw Error('Camera did not verify its image gallery.');
    const items=gallery.items.filter(validCameraEntry);
    this.lastScan=this.clock();this.error=null;this.state='watching';
    const incoming=items.filter(item=>!this.baseline.has(cameraEntryKey(item))&&!this.completed.has(cameraEntryKey(item)));
    // Prefer file order supplied by native helper, but never import an unlimited
    // entire card if the camera reconnects with different object handles.
    for(const item of incoming.slice(0,MAX_PER_SCAN)){
      if(!this.active)break;
      if(await this.ready()!==true)throw Error('Camera session changed before photo download.');
      const key=cameraEntryKey(item);
      try{
        const original=await this.download(item);
        if(!this.active)break;
        if(!Buffer.isBuffer(original)||original.length!==item.bytes)throw Error('The camera returned incomplete original bytes.');
        // Files are always written with an unguessable suffix; nothing can
        // overwrite a different capture with a reused DSCF filename.
        await fsp.mkdir(this.destination,{recursive:true});
        const suffix=path.extname(item.name),stem=path.basename(item.name,suffix);
        const hash=crypto.createHash('sha256').update(original).digest('hex').slice(0,16);
        const safeName=`${stem}_${hash}${suffix}`;
        const final=path.join(this.destination,safeName);
        const tmp=path.join(this.destination,`.${stem}_${crypto.randomUUID()}.part`);
        try{
          await fsp.writeFile(tmp,original,{flag:'wx',mode:0o600});
          // Hard link is atomic and never overwrites a pre-existing name.
          try{await fsp.link(tmp,final)}catch(e){if(e.code!=='EEXIST')throw e}
        }finally{await fsp.rm(tmp,{force:true})}
        this.completed.add(key);this.attempts.delete(key);this.imported++;
        this.lastTransfer=this.clock();this.files.unshift({name:safeName,sourceName:item.name,bytes:item.bytes,arrivedAt:this.lastTransfer});
        this.files.length=Math.min(50,this.files.length);
      }catch(e){
        const attempts=(this.attempts.get(key)||0)+1;this.attempts.set(key,attempts);
        throw Error(`Cannot safely import ${item.name} (attempt ${attempts}): ${String(e?.message||e).slice(0,100)}`);
      }
    }
    return this.status();
  }
}
