/** Explicit, read-only camera card import. No camera transport or media mutations.
 * API: listMounts(), selectMount(name), scan(), importFiles(ids), status().
 * A selected volume must be enumerated under /Volumes and backed by a separate
 * filesystem. volumeRoot/allowFixtureMounts exist solely for isolated tests.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const FORMATS = /\.(?:jpe?g|raf)$/i;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/;
// macOS commonly mounts FAT-formatted camera cards as "NO NAME".
// Mount labels are selected by enumeration, not interpolated user paths.
const SAFE_MOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _().-]{0,100}$/;
const MAX_FILE = 200 * 1024 * 1024;
const MAX_ITEMS = 2000;
const MAX_BATCH = 100;
const MAX_BATCH_BYTES = 1024 * 1024 * 1024;
const FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);

function boundedInteger(value, fallback, limit) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, limit) : fallback;
}

function signatureValid(header, tail, name) {
  if (/\.raf$/i.test(name)) return header.toString('ascii', 0, 15) === 'FUJIFILMCCD-RAW';
  return header[0] === 255 && header[1] === 216 && tail[tail.length-2] === 255 && tail[tail.length-1] === 217;
}

async function safeDir(folder) {
  const stat = await fsp.lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe card directory.');
  return stat;
}

async function safeFile(folder, relative) {
  const parts = relative.split('/');
  if (parts.length < 2 || parts.length > 5 || parts.some(part => part === '.' || part === '..' || !SAFE_NAME.test(part))) {
    throw Error('Unsafe card file path.');
  }
  let current = folder;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    await safeDir(current);
  }
  const full = path.join(current, parts.at(-1));
  const stat = await fsp.lstat(full);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('Unsafe card file.');
  return {full, stat};
}

export class CameraCardImport {
  constructor({
    volumeRoot = '/Volumes',
    destination = path.join(os.homedir(), 'Pictures', 'FujiX Sync', 'Originals'),
    allowFixtureMounts = false,
    maxItems = MAX_ITEMS,
    maxBatch = MAX_BATCH,
    maxBatchBytes = MAX_BATCH_BYTES
  } = {}) {
    this.volumeRoot = path.resolve(volumeRoot);
    this.destination = path.resolve(destination);
    this.allowFixtureMounts = allowFixtureMounts;
    this.maxItems = boundedInteger(maxItems, MAX_ITEMS, MAX_ITEMS);
    this.maxBatch = boundedInteger(maxBatch, MAX_BATCH, MAX_BATCH);
    this.maxBatchBytes = boundedInteger(maxBatchBytes, MAX_BATCH_BYTES, MAX_BATCH_BYTES);
    this.selected = null;
    this.items = new Map();
    this.busy = false;
  }

  status() {
    return {selected: this.selected?.name || null, destination: this.destination,
      count: this.items.size, importing: this.busy, mode: 'read-only-card-reader',
      note: 'Select an externally mounted camera card. Only DCIM JPEG/RAF originals are copied; the card is never modified.'};
  }

  async listMounts() {
    let root;
    try { root = await safeDir(this.volumeRoot); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const entries = await fsp.readdir(this.volumeRoot, {withFileTypes: true});
    const canonicalRoot = await fsp.realpath(this.volumeRoot);
    const available = [];
    for (const entry of entries.slice(0, 256)) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !SAFE_MOUNT_NAME.test(entry.name)) continue;
      const full = path.join(this.volumeRoot, entry.name);
      try {
        const stat = await safeDir(full);
        if (!this.allowFixtureMounts && stat.dev === root.dev) continue;
        const real = await fsp.realpath(full);
        if (real !== path.join(canonicalRoot, entry.name)) continue;
        await safeDir(path.join(full, 'DCIM'));
        available.push({name: entry.name, path: real});
      } catch { /* no DCIM, mount gone or symlink */ }
    }
    return available;
  }

  async selectMount(name) {
    if (this.busy) throw Error('An import is already running.');
    if (typeof name !== 'string' || !SAFE_MOUNT_NAME.test(name)) throw Error('Invalid card mount selection.');
    const mounts = await this.listMounts();
    const mount = mounts.find(m => m.name === name);
    if (!mount) throw Error('Camera card is unavailable or is not an allowed external DCIM volume.');
    const stat = await safeDir(mount.path);
    this.selected = {...mount, dev: stat.dev, ino: stat.ino};
    this.items.clear();
    return this.status();
  }

  async assertSelected() {
    if (!this.selected) throw Error('Choose an external camera card before scanning.');
    const mounts = await this.listMounts();
    if (!mounts.some(m => m.name === this.selected.name && m.path === this.selected.path)) throw Error('Selected camera card was disconnected.');
    const stat = await safeDir(this.selected.path);
    if (stat.dev !== this.selected.dev || stat.ino !== this.selected.ino) throw Error('Selected camera card changed. Select it again.');
  }

  async scan() {
    if (this.busy) throw Error('Cannot scan while an import is running.');
    await this.assertSelected();
    this.items.clear();
    // Camera DCIM normally contains 100_FUJI directories. Bound directory
    // count, depth and total file metadata returned to the server.
    const dcim = path.join(this.selected.path, 'DCIM');
    await safeDir(dcim);
    let visited = 0;
    const walk = async (folder, prefix, depth) => {
      const entries = (await fsp.readdir(folder, {withFileTypes:true})).slice(0, 2048);
      for (const entry of entries) {
        if (++visited > 8192 || this.items.size >= this.maxItems) return;
        if (entry.isSymbolicLink() || !SAFE_NAME.test(entry.name)) continue;
        const relative = [...prefix, entry.name].join('/');
        if (entry.isDirectory() && depth < 3) {
          const full = path.join(folder, entry.name);
          try { await safeDir(full); await walk(full, [...prefix,entry.name],depth+1); } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'EACCES') throw error;
          }
        } else if (entry.isFile() && FORMATS.test(entry.name)) {
          try {
            const {stat} = await safeFile(this.selected.path, relative);
            if (stat.size < 128 || stat.size > MAX_FILE) continue;
            const id = crypto.createHash('sha256').update(relative).update('\0').update(String(stat.ino)).update('\0').update(String(stat.size)).update('\0').update(String(stat.mtimeMs)).digest('hex').slice(0, 32);
            this.items.set(id, {id, name:entry.name, relative, bytes:stat.size, modifiedAt:stat.mtimeMs,
              format:path.extname(entry.name).slice(1).toUpperCase(), ino:stat.ino, dev:stat.dev});
          } catch (error) { if (!['ENOENT','EACCES'].includes(error.code)) throw error; }
        }
      }
    };
    await walk(dcim, ['DCIM'], 0);
    return {mount:this.selected.name, count:this.items.size, truncated:visited > 8192 || this.items.size >= this.maxItems,
      files:[...this.items.values()].map(({id,name,relative,bytes,modifiedAt,format})=>({id,name,relative,bytes,modifiedAt,format}))};
  }

  async prepareDestination() {
    await fsp.mkdir(this.destination, {recursive:true,mode:0o700});
    const actual = await fsp.realpath(this.destination);
    if (await fsp.realpath(path.dirname(this.destination)) !== path.dirname(actual) ||
        path.basename(actual) !== path.basename(this.destination)) throw Error('Destination contains an unsafe alias.');
    await safeDir(this.destination);
    this.destination = actual;
  }

  async importFiles(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > this.maxBatch || ids.some(id=>typeof id!=='string'||!this.items.has(id)) || new Set(ids).size!==ids.length) {
      throw Error('Choose a bounded set of files from the latest card scan.');
    }
    if (this.busy) throw Error('Another card import is already running.');
    this.busy = true;
    try {
      await this.assertSelected();
      const total = ids.reduce((sum,id)=>sum+this.items.get(id).bytes,0);
      if (total > this.maxBatchBytes) throw Error('Selected photos exceed the per-import byte limit.');
      await this.prepareDestination();
      const results=[];
      for (const id of ids) {
        await this.assertSelected();
        results.push(await this.copyOne(this.items.get(id)));
      }
      return {imported:results.filter(r=>!r.duplicate).length, skipped:results.filter(r=>r.duplicate).length, files:results};
    } finally { this.busy=false; }
  }

  async copyOne(item) {
    const {full,stat} = await safeFile(this.selected.path,item.relative);
    if (stat.dev!==item.dev || stat.ino!==item.ino || stat.size!==item.bytes || stat.mtimeMs!==item.modifiedAt) throw Error('Card photo changed since preview. Scan again.');
    // A random temporary file remains entirely inside Mac storage. Source is
    // opened read-only with O_NOFOLLOW; verify inode immediately afterward.
    const source = await fsp.open(full, FLAGS);
    let tmp=null;
    try {
      const opened=await source.stat();
      if (!opened.isFile() || opened.dev!==item.dev || opened.ino!==item.ino || opened.size!==item.bytes) throw Error('Card photo changed during open.');
      const resolved=await fsp.realpath(full);
      if (resolved!==full) throw Error('Unsafe card symlink change.');
      const tempName = '.fujix-card-'+crypto.randomUUID()+'.part';
      tmp = path.join(this.destination,tempName);
      const out=await fsp.open(tmp,'wx',0o600);
      const hash=crypto.createHash('sha256');
      const buffer=Buffer.allocUnsafe(64*1024);
      let bytes=0,head=Buffer.alloc(0),tail=Buffer.alloc(0);
      try {
        for (;;) {
          const {bytesRead}=await source.read(buffer,0,buffer.length,null);
          if (!bytesRead) break;
          bytes+=bytesRead;
          if (bytes>MAX_FILE || bytes>item.bytes) throw Error('Card file exceeds its scanned size.');
          const chunk=buffer.subarray(0,bytesRead);
          hash.update(chunk);
          if(head.length<32) head=Buffer.concat([head,chunk]).subarray(0,32);
          tail=Buffer.concat([tail,chunk]).subarray(-4);
          let offset=0;
          while(offset<bytesRead) { const {bytesWritten}=await out.write(chunk,offset,bytesRead-offset); if(!bytesWritten) throw Error('Destination write stopped.'); offset+=bytesWritten; }
        }
        if(bytes!==item.bytes) throw Error('Card photo changed during copy; incomplete original discarded.');
        if(!signatureValid(head,tail,item.name)) throw Error('Photo signature does not match JPEG/RAF format.');
        const after=await source.stat();
        if(after.size!==item.bytes || after.mtimeMs!==item.modifiedAt || after.ino!==item.ino) throw Error('Card photo modified during import.');
        await out.sync();
      } finally { await out.close(); }
      const digest=hash.digest('hex');
      const fingerprint=digest.slice(0,24);
      const existing=(await fsp.readdir(this.destination)).filter(n=>n.startsWith('X100VI-Original-'+fingerprint+'-'));
      if(existing.length) {
        // Never trust a name alone to decide a duplicate. Verify the full hash.
        for(const name of existing.slice(0,100)) {
          const candidate=path.join(this.destination,name);
          const info=await fsp.lstat(candidate);
          if(!info.isFile()||info.isSymbolicLink()||info.size!==bytes)continue;
          const prior=crypto.createHash('sha256');
          for await(const chunk of fs.createReadStream(candidate,{flags:FLAGS}))prior.update(chunk);
          if(prior.digest('hex')===digest)return {name:item.name,bytes,sha256:digest,duplicate:true,savedName:name};
        }
        throw Error('Content fingerprint collision in destination.');
      }
      const savedName='X100VI-Original-'+fingerprint+'-'+item.name;
      const published=path.join(this.destination,savedName);
      try {
        // APFS: atomic, no-overwrite publication by hard-linking the fully
        // verified temporary file. This doesn't change the card's source.
        await fsp.link(tmp,published);
      } catch(error) {
        if (!['ENOTSUP','EOPNOTSUPP','ENOSYS','EPERM','EINVAL'].includes(error.code)) throw error;
        // Jarvis's 4TB Expansion uses ExFAT, which doesn't support hard
        // links. COPYFILE_EXCL is the no-overwrite fallback. Never rename
        // over a user's existing file. Verify the published copy and remove
        // it on failure. A crash mid-copy is recognizable as a bad JPEG/RAF.
        let created=false;
        try{
          await fsp.copyFile(tmp,published,fs.constants.COPYFILE_EXCL);
          created=true;
          const publishedStat=await fsp.lstat(published);
          if(!publishedStat.isFile()||publishedStat.isSymbolicLink()||publishedStat.size!==bytes)
            throw Error('Published original size verification failed.');
          const finalHash=crypto.createHash('sha256');
          for await(const part of fs.createReadStream(published,{flags:FLAGS}))finalHash.update(part);
          if(finalHash.digest('hex')!==digest)throw Error('Published original checksum verification failed.');
          const handle=await fsp.open(published,'r');
          try{await handle.sync()}finally{await handle.close()}
        }catch(copyError){
          // COPYFILE_EXCL never replaces an existing destination. For a
          // failed new copy, clean up a possible partial final file too.
          if(created || copyError.code!=='EEXIST')
            await fsp.rm(published,{force:true}).catch(()=>{});
          throw copyError;
        }
      }
      return {name:item.name,bytes,sha256:digest,duplicate:false,savedName};
    } finally {
      await source.close();
      if(tmp)await fsp.rm(tmp,{force:true}).catch(()=>{});
    }
  }
}
