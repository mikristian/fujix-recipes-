/** Watch an *already delivered* original-file folder and copy future camera
 * originals to the local Mac FujiX gallery. Does NOT access UVC SD data,
 * pair Bluetooth, silently fire a camera shutter, or infer successful capture.
 * Reuses TetherInbox's symlink protection and stable-file gate.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function sha256Stream(stream,expected){
  let bytes=0;
  const hash=crypto.createHash('sha256');
  for await(const chunk of stream){
    bytes+=chunk.length;
    if(bytes>200*1024*1024)throw Error('Incoming photo is larger than the archive limit.');
    hash.update(chunk);
  }
  if(bytes!==expected)throw Error('The delivered photo changed while hashing; no import accepted.');
  return hash.digest('hex');
}
async function duplicateInFullArchive(library,size,hash){
  await library.prepare();
  const entries=await fsp.readdir(library.originals,{withFileTypes:true});
  if(entries.length>100000)throw Error('Too many archive originals for safe duplicate verification.');
  for(const entry of entries){
    if(!entry.isFile()||entry.isSymbolicLink()||
      !/^X100VI-Original-[a-f0-9]{24}-.+\.(?:raf|jpe?g|png|tiff?|heic|heif)$/i.test(entry.name))continue;
    const full=path.join(library.originals,entry.name);
    const stat=await fsp.lstat(full).catch(()=>null);
    if(!stat?.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size!==size)continue;
    if(await sha256Stream(fs.createReadStream(full,{flags:fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)}),size)===hash)
      return true;
  }
  return false;
}
export class IncomingOriginalImport {
  constructor({inbox,library,pollMs=2500,baselineDelayMs=750,maxPerScan=4,maxPerSession=100}={}){
    if(!inbox||!library)throw Error('Tether inbox and Mac photo library are required.');
    this.inbox=inbox;this.library=library;
    this.pollMs=Math.min(60000,Math.max(800,pollMs));this.baselineDelayMs=baselineDelayMs;
    this.maxPerScan=maxPerScan;this.maxPerSession=maxPerSession;
    this.active=false;this.starting=false;this.generation=0;this.baseline=new Set();this.done=new Set();this.failures=new Map();this.timer=null;this.pending=null;
    this.imported=0;this.skippedDuplicates=0;this.lastCopied=null;this.lastError=null;this.since=null;this.lastScan=null;
  }
  status(){return {active:this.active,starting:this.starting,state:this.active?'watching':this.starting?'initializing':'off',source:this.inbox.folder||null,destination:this.library.originals,
    imported:this.imported,skippedDuplicates:this.skippedDuplicates,lastCopied:this.lastCopied,lastError:this.lastError,since:this.since,lastScan:this.lastScan,
    note:'Watches real originals already delivered by Frame.io sync or another Mac transfer. Verifies SHA-256; never downloads directly from USB WEBCAM or fires a shutter.'};}
  async start(){
    if(this.active)return this.status();
    if(this.starting||this.pending)throw Error('An import operation is already running.');
    if(!this.inbox.folder)throw Error('Choose a real incoming-photo source folder before starting auto-import.');
    // Never create a source or mutate SD files; only destination folders.
    this.starting=true;const generation=++this.generation;
    try{
      await this.library.prepare();
      await this.inbox.scan();
      if(this.baselineDelayMs)await new Promise(resolve=>setTimeout(resolve,this.baselineDelayMs));
      const initial=await this.inbox.scan();
      if(generation!==this.generation)throw Error('Auto-import was stopped during initialization.');
      if(initial.error)throw Error(initial.error);
      this.baseline=new Set((initial.files||[]).map(f=>f.id));
      this.done.clear();this.failures.clear();this.imported=0;this.skippedDuplicates=0;this.lastCopied=null;this.lastError=null;
      this.since=Date.now();this.lastScan=Date.now();this.active=true;this.starting=false;
      this.schedule(generation);return this.status();
    }catch(error){this.lastError=String(error?.message||error).slice(0,180);throw error}
    finally{this.starting=false}
  }
  schedule(generation){
    if(!this.active||generation!==this.generation)return;
    this.timer=setTimeout(async()=>{
      this.timer=null;
      try{await this.scan()}catch(error){if(this.active)this.lastError=String(error?.message||error).slice(0,200)}
      if(this.active&&generation===this.generation)this.schedule(generation);
    },this.pollMs);
    this.timer.unref?.();
  }
  async stop(){
    this.active=false;this.generation++;
    if(this.timer){clearTimeout(this.timer);this.timer=null}
    if(this.pending)await this.pending;
    return this.status();
  }
  async scan(){
    if(!this.active)return this.status();
    if(this.pending)return this.pending;
    const job=this._scanInternal();this.pending=job;
    try{return await job}finally{if(this.pending===job)this.pending=null}
  }
  async _scanInternal(){
    const result=await this.inbox.scan();
    this.lastScan=Date.now();
    if(result.error)throw Error(result.error);
    const arriving=(result.files||[]).filter(f=>!this.baseline.has(f.id)&&!this.done.has(f.id)&&!this.failures.has(f.id));
    for(const original of arriving.slice(0,this.maxPerScan)){
      if(!this.active)break;
      if(this.imported>=this.maxPerSession){this.active=false;this.lastError='Auto-import stopped at the session safety limit; restart to process more files.';break}
      try{
        const file=await this.inbox.file(original.id);
        if(!this.active){file.stream.destroy();break}
        const expectedHash=await sha256Stream(file.stream,file.size);
        if(!this.active)break;
        if(await duplicateInFullArchive(this.library,file.size,expectedHash)){
          this.done.add(original.id);this.skippedDuplicates++;this.lastError=null;
          continue;
        }
        // Reopen through TetherInbox's strict size/mtime/symlink gate. Hash
        // bytes while copying to detect any source changes between the first
        // hash and the actual archive write.
        const reopened=await this.inbox.file(original.id);
        const copiedHash=crypto.createHash('sha256');
        let copiedBytes=0;
        const verifiedChunks=async function*(){
          for await(const chunk of reopened.stream){
            copiedBytes+=chunk.length;
            if(copiedBytes>file.size)throw Error('Delivered source photo grew during copy.');
            copiedHash.update(chunk);
            yield chunk;
          }
        };
        const source={
          headers:{'content-length':String(reopened.size),'content-type':reopened.mime},
          [Symbol.asyncIterator]:verifiedChunks,
        };
        const saved=await this.library.write(source,{kind:'original',filename:file.filename});
        const archivedPath=path.join(this.library.originals,saved.savedName);
        try{
          const archiveHash=await sha256Stream(fs.createReadStream(archivedPath,
            {flags:fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)}),saved.bytes);
          if(copiedBytes!==file.size||copiedHash.digest('hex')!==expectedHash||archiveHash!==expectedHash)
            throw Error('Source or archived photo checksum changed during copy.');
        }catch(error){
          // Delete only the newly written unverified archive file; never
          // touch the watched delivery source or prior verified originals.
          const created=await fsp.lstat(archivedPath).catch(()=>null);
          if(created?.isFile()&&!created.isSymbolicLink())await fsp.unlink(archivedPath).catch(()=>{});
          throw error;
        }
        // A successful native Mac save with validated original bytes is the
        // ONLY condition counted as a completed transfer.
        this.done.add(original.id);this.imported++;this.lastCopied={name:saved.name,bytes:saved.bytes,at:Date.now(),id:saved.id};this.lastError=null;
      }catch(error){
        // Do not repeatedly re-ingest a malformed file every 2 seconds.
        this.failures.set(original.id,String(error?.message||error));
        this.lastError=`Failed to import ${original.name}: ${String(error?.message||error).slice(0,125)}`;
      }
    }
    return this.status();
  }
}
