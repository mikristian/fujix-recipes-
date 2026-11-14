/** Read-only source-folder monitor for FujiX Sync's Capture One-style review.
 * The camera has no official tether interface: these are files that have
 * ALREADY ARRIVED from Frame.io Drive, XApp or another legitimate transfer.
 * No cloud credentials, SD-card writes, recursive unbounded scans or guesses.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const EXT=new Set(['.jpg','.jpeg','.png','.tif','.tiff','.heif','.heic','.raf']);
const MAX_BYTES=400*1024*1024;
const FILE_CAP=1000;
const DISPLAY_CAP=150;
export class TetherInbox {
  constructor({home=os.homedir(),stabilityMs=600,now=()=>Date.now()}={}){
    this.home=fs.realpathSync(path.resolve(home));this.stabilityMs=stabilityMs;this.now=now;
    this.folder=null;this.folderLabel='';this.entries=new Map();this.samples=new Map();
    this.pending=false;this.lastScan=null;this.lastError=null;
  }
  async configure(input){
    if(typeof input!=='string'||!input.trim()||input.length>1024||input.includes('\0'))throw Error('Choose an existing Finder folder, not a network URL.');
    const requested=path.resolve(input.trim().replace(/^~(?=\/)/,this.home));
    const resolved=await fsp.realpath(requested);
    const roots=[this.home, '/Volumes'];
    if(!roots.some(root=>resolved.startsWith(root+path.sep))||roots.includes(resolved))throw Error('Only folders under your Mac home directory or an external mounted volume can be watched.');
    const stat=await fsp.stat(resolved);
    if(!stat.isDirectory())throw Error('The selected path is not an existing folder.');
    this.folder=resolved;this.folderLabel=path.basename(resolved);
    this.entries.clear();this.samples.clear();this.lastScan=null;this.lastError=null;
    return this.status();
  }
  status(){return {configured:Boolean(this.folder),folder:this.folder,folderLabel:this.folderLabel,latestScan:this.lastScan,error:this.lastError,count:this.entries.size,mode:'read-only-mounted-folder',note:'Photos appear only after Frame.io Drive, XApp or another transfer puts real files in this folder. This is not a native camera tether.'}}
  async scan(){
    if(!this.folder)return { ...this.status(),files:[] };
    if(this.pending)return { ...this.status(),files:this.list() };
    this.pending=true;
    try{
      const found=[];
      const todo=[{dir:this.folder,depth:0}];let traversed=0;
      while(todo.length&&traversed<FILE_CAP){
        const {dir,depth}=todo.shift();
        const contents=await fsp.readdir(dir,{withFileTypes:true});
        for(const dent of contents){
          if(++traversed>FILE_CAP)break;
          if(dent.name.startsWith('.')||dent.isSymbolicLink())continue;
          const full=path.join(dir,dent.name);
          if(dent.isDirectory()){
            if(depth<3&&todo.length<100)todo.push({dir:full,depth:depth+1});
            continue;
          }
          if(!dent.isFile()||!EXT.has(path.extname(dent.name).toLowerCase()))continue;
          try{
            const stat=await fsp.stat(full);
            if(stat.size<128||stat.size>MAX_BYTES||!stat.isFile())continue;
            const relative=path.relative(this.folder,full);
            if(relative.startsWith('..')||path.isAbsolute(relative))continue;
            const key=`${relative}\0${stat.size}\0${Math.trunc(stat.mtimeMs)}`;
            const sample=this.samples.get(relative);
            if(!sample||sample.key!==key){this.samples.set(relative,{key,firstSeen:this.now()});continue}
            if(this.now()-sample.firstSeen<this.stabilityMs)continue;
            const id=crypto.createHash('sha256').update(key).digest('hex').slice(0,24);
            found.push({id,name:dent.name,relative,size:stat.size,mtimeMs:stat.mtimeMs,format:path.extname(dent.name).toLowerCase().slice(1),_full:full});
          }catch(e){if(e.code!=='ENOENT')this.lastError='Some camera files could not be inspected.'}
        }
      }
      found.sort((a,b)=>b.mtimeMs-a.mtimeMs);
      this.entries=new Map(found.slice(0,DISPLAY_CAP).map(entry=>[entry.id,entry]));
      this.lastScan=this.now();this.lastError=null;
      return {...this.status(),files:this.list()};
    }catch(e){this.lastError='Cannot read the chosen folder. Confirm Frame.io Drive is mounted and you have access to the project.';return {...this.status(),files:this.list()};}
    finally{this.pending=false}
  }
  list(){return [...this.entries.values()].map(({_full,...publicEntry})=>publicEntry)}
  async file(id){
    if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw Error('Invalid photo identifier.');
    const entry=this.entries.get(id);
    if(!entry||!this.folder)throw Error('This photo is not in the latest verified inbox listing.');
    const stat=await fsp.lstat(entry._full);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size||Math.trunc(stat.mtimeMs)!==Math.trunc(entry.mtimeMs))throw Error('File changed while transferring. Refresh the inbox first.');
    const resolved=await fsp.realpath(entry._full);
    if(!resolved.startsWith(this.folder+path.sep))throw Error('The file is outside the selected inbox.');
    const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',tif:'image/tiff',tiff:'image/tiff',heif:'image/heif',heic:'image/heic',raf:'application/octet-stream'}[entry.format]||'application/octet-stream';
    return {stream:fs.createReadStream(resolved),filename:entry.name,size:entry.size,mime};
  }
}
