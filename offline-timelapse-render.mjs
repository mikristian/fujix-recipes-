/** Offline time-lapse renderer: read-only imported images, private staging, atomic no-clobber publication. */
import path from 'node:path';
import fs from 'node:fs/promises';
import {constants as FS_CONSTANTS,createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {sniffImageHeader} from './offline-image-inspector.mjs';

export const MAX_TIMELAPSE_FRAMES=600;
export const MAX_TIMELAPSE_FRAME_BYTES=75*1024*1024;
export const MAX_TIMELAPSE_TOTAL_BYTES=2*1024*1024*1024;
const MAX_MOVIE_BYTES=2*1024*1024*1024;
const MIN_TIMEOUT_MS=1000;
const MAX_TIMEOUT_MS=30*60*1000;
const ALLOWED_EXTENSIONS=new Set(['.jpeg','.jpg','.png']);

function validateName(name,{movie=false}={}){
 if(typeof name!=='string'||!name||name.startsWith('/')||name.includes('\\')||/^[a-z]:/i.test(name)||/[\u0000-\u001f\u007f]/.test(name))throw Error('Unsafe relative filename');
 const parts=name.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe relative filename');
 if(movie){if(parts.length!==1||!name.toLowerCase().endsWith('.mp4'))throw Error('Output must be an MP4 filename in the output root')}
 else if(!ALLOWED_EXTENSIONS.has(path.posix.extname(name).toLowerCase()))throw Error('Only JPEG and PNG inputs are supported');
 return name;
}

function validateOptions(options){
 const {sourceRoot,outputRoot,filenames,outputName='timelapse.mp4',fps=24,secondsPerImage=null,maxFrameBytes=MAX_TIMELAPSE_FRAME_BYTES,maxTotalBytes=MAX_TIMELAPSE_TOTAL_BYTES,timeoutMs=120000}=options??{};
 if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot)||typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))throw Error('Source and output roots must be absolute paths');
 if(!Array.isArray(filenames)||filenames.length<2||filenames.length>MAX_TIMELAPSE_FRAMES)throw Error('Frame count outside bounds (2–600)');
 const names=filenames.map(name=>validateName(name));
 if(new Set(names).size!==names.length)throw Error('Duplicate input filename');
 validateName(outputName,{movie:true});
 if(!Number.isInteger(fps)||fps<1||fps>120)throw Error('FPS outside bounds');
 if(secondsPerImage!==null&&(!Number.isFinite(secondsPerImage)||secondsPerImage<=0||secondsPerImage>3600))throw Error('Invalid secondsPerImage');
 if(!Number.isSafeInteger(maxFrameBytes)||maxFrameBytes<33||maxFrameBytes>MAX_TIMELAPSE_FRAME_BYTES)throw Error('Invalid maxFrameBytes');
 if(!Number.isSafeInteger(maxTotalBytes)||maxTotalBytes<maxFrameBytes||maxTotalBytes>MAX_TIMELAPSE_TOTAL_BYTES)throw Error('Invalid maxTotalBytes');
 if(!Number.isInteger(timeoutMs)||timeoutMs<MIN_TIMEOUT_MS||timeoutMs>MAX_TIMEOUT_MS)throw Error('Invalid timeoutMs');
 return {sourceRoot,outputRoot,filenames:names,outputName,fps,secondsPerImage,maxFrameBytes,maxTotalBytes,timeoutMs};
}

async function directoryRoot(input){
 const original=await fs.lstat(input);
 if(original.isSymbolicLink()||!original.isDirectory())throw Error('Unsafe root directory or symlink');
 const real=await fs.realpath(input);
 const stat=await fs.lstat(real);
 if(!stat.isDirectory())throw Error('Root is not a directory');
 return real;
}

async function readFilePath(root,filename,maxBytes){
 let dir=root;
 for(const part of filename.split('/').slice(0,-1)){
  dir=path.join(dir,part);
  const stat=await fs.lstat(dir);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe source directory or symlink');
 }
 const absolute=path.join(dir,filename.split('/').at(-1));
 const before=await fs.lstat(absolute);
 if(before.isSymbolicLink()||!before.isFile())throw Error('Unsafe source image or symlink');
 if(before.size<33||before.size>maxBytes)throw Error('Input image exceeds size bounds');
 return {absolute,before};
}

async function readHeader(handle,bytes,filename){
 const size=Math.min(bytes,256*1024),header=Buffer.alloc(size);
 let offset=0;
 while(offset<size){const {bytesRead}=await handle.read(header,offset,size-offset,offset);if(!bytesRead)throw Error('Source image truncated');offset+=bytesRead}
 const result=sniffImageHeader(header,{filename,fileSize:bytes});
 if(result.format==='jpeg'){
  // Require the JPEG end marker; a stream that merely begins like JPEG is insufficient.
  const tail=Buffer.alloc(2);
  if((await handle.read(tail,0,2,bytes-2)).bytesRead!==2||tail[0]!==255||tail[1]!==217)throw Error('Incomplete JPEG image');
 }else if(result.format==='png'){
  const tail=Buffer.alloc(12);
  if(bytes<45||(await handle.read(tail,0,12,bytes-12)).bytesRead!==12||tail.readUInt32BE(0)!==0||tail.toString('ascii',4,8)!=='IEND')throw Error('Incomplete PNG image');
 }
 return result;
}

async function checkedHandle(root,filename,maxBytes){
 const {absolute,before}=await readFilePath(root,filename,maxBytes);
 const handle=await fs.open(absolute,FS_CONSTANTS.O_RDONLY|FS_CONSTANTS.O_NOFOLLOW);
 try{
  const now=await handle.stat();
  if(!now.isFile()||now.ino!==before.ino||now.dev!==before.dev||now.size!==before.size)throw Error('Input file changed before inspection');
  const header=await readHeader(handle,now.size,filename);
  return {handle,stat:now,header};
 }catch(e){await handle.close();throw e}
}

export async function planOfflineTimelapse(options){
 const config=validateOptions(options);
 const sourceRoot=await directoryRoot(config.sourceRoot);
 const outputRoot=await directoryRoot(config.outputRoot);
 if(sourceRoot===outputRoot)throw Error('Source and output folders must be separate');
 const outputPath=path.join(outputRoot,config.outputName);
 try{await fs.lstat(outputPath);throw Error('Output filename already exists')}catch(error){if(error.code!=='ENOENT')throw error}
 const images=[];let totalBytes=0;
 for(const filename of config.filenames){
  const {handle,stat,header}=await checkedHandle(sourceRoot,filename,config.maxFrameBytes);
  await handle.close();
  totalBytes+=stat.size;
  if(totalBytes>config.maxTotalBytes)throw Error('Total input image bytes exceed limit');
  images.push({filename,bytes:stat.size,format:header.format,dimensions:header.dimensions});
 }
 return {sourceRoot,outputRoot,outputName:config.outputName,frameCount:images.length,frames:images,totalInputBytes:totalBytes,fps:config.fps,secondsPerImage:config.secondsPerImage,estimatedDurationSeconds:images.length*(config.secondsPerImage??1/config.fps),timeoutMs:config.timeoutMs,readOnlySources:true,willExecute:false};
}

function assertNotAborted(signal){if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:Object.assign(Error('Timelapse render canceled'),{name:'AbortError'})}

async function copyValidatedImage(root,filename,destination,maxBytes,signal){
 assertNotAborted(signal);
 const {handle,stat,header}=await checkedHandle(root,filename,maxBytes);
 const hash=crypto.createHash('sha256');
 let destinationHandle;
 try{
  destinationHandle=await fs.open(destination,FS_CONSTANTS.O_WRONLY|FS_CONSTANTS.O_CREAT|FS_CONSTANTS.O_EXCL,0o600);
  const block=Buffer.allocUnsafe(1024*1024);
  let position=0;
  while(position<stat.size){
   assertNotAborted(signal);
   const {bytesRead}=await handle.read(block,0,Math.min(block.length,stat.size-position),position);
   if(!bytesRead)throw Error('Input image truncated while staging');
   await destinationHandle.writeFile(block.subarray(0,bytesRead));hash.update(block.subarray(0,bytesRead));position+=bytesRead;
  }
  const after=await handle.stat();
  if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ino!==stat.ino||after.dev!==stat.dev)throw Error('Input image changed while staging');
  await destinationHandle.sync();
  return {filename,bytes:stat.size,format:header.format,sha256:hash.digest('hex')};
 }finally{await destinationHandle?.close();await handle.close()}
}

async function requireFfmpegBinary(ffmpegPath){
 if(typeof ffmpegPath!=='string'||!path.isAbsolute(ffmpegPath))throw Error('Caller must supply absolute FFmpeg executable path');
 const stat=await fs.lstat(ffmpegPath);
 if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o111)===0)throw Error('Unsafe FFmpeg executable');
 return ffmpegPath;
}

async function fileDigest(filename){
 const hash=crypto.createHash('sha256');
 for await(const chunk of createReadStream(filename,{flags:FS_CONSTANTS.O_RDONLY|FS_CONSTANTS.O_NOFOLLOW}))hash.update(chunk);
 return hash.digest('hex');
}

function runFfmpeg(binary,args,{timeoutMs,signal}){
 return new Promise((resolve,reject)=>{
  let settled=false,stderr='',abortReason=null;
  const child=spawn(binary,args,{shell:false,stdio:['ignore','ignore','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'C'},windowsHide:true});
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);error?reject(error):resolve()};
  const stop=(reason)=>{abortReason=reason;child.kill('SIGKILL')};
  const onAbort=()=>stop(signal.reason instanceof Error?signal.reason:Object.assign(Error('Timelapse render canceled'),{name:'AbortError'}));
  const timer=setTimeout(()=>stop(Error('FFmpeg render timed out')),timeoutMs);
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2048)});
  child.on('error',finish);
  child.on('close',(code,signalName)=>finish(abortReason||(code===0?null:Error(`FFmpeg failed (code ${code}, signal ${signalName}): ${stderr.slice(-500)}`))));
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted)onAbort();
 });
}

/** Stage complete frames and render inside the output root. Final publication is atomic and no-clobber. */
export async function renderOfflineTimelapse(options){
 const config=validateOptions(options);
 assertNotAborted(options?.signal);
 const binary=await requireFfmpegBinary(options?.ffmpegPath);
 const plan=await planOfflineTimelapse(config);
 const stageRoot=await fs.mkdtemp(path.join(plan.outputRoot,'.timelapse-'));
 const stageMovie=path.join(stageRoot,'render.mp4');
 try{
  const staging=[];
  for(let i=0;i<config.filenames.length;i++){
   const original=config.filenames[i];
   const staged=path.join(stageRoot,`frame-${String(i).padStart(6,'0')}.${path.extname(original).toLowerCase().slice(1)}`);
   staging.push({original,staged});
   await copyValidatedImage(plan.sourceRoot,original,staged,config.maxFrameBytes,options?.signal);
  }
  assertNotAborted(options?.signal);
  const frameList=path.join(stageRoot,'frames.ffconcat');
  const lines=['ffconcat version 1.0'];
  // Paths are internally generated and contain no spaces, quotes, or escapes.
  for(const {staged} of staging){lines.push(`file '${path.basename(staged)}'`);if(config.secondsPerImage!==null)lines.push(`duration ${config.secondsPerImage}`)}
  if(config.secondsPerImage!==null)lines.push(`file '${path.basename(staging.at(-1).staged)}'`);
  await fs.writeFile(frameList,lines.join('\n')+'\n',{flag:'wx',mode:0o600});
  const args=['-hide_banner','-nostdin','-loglevel','error','-y','-safe','1','-f','concat','-i',frameList];
  if(config.secondsPerImage===null)args.push('-vf',`fps=${config.fps}`);
  else args.push('-fps_mode','vfr');
  args.push('-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',stageMovie);
  await runFfmpeg(binary,args,{timeoutMs:config.timeoutMs,signal:options?.signal});
  assertNotAborted(options?.signal);
  const stat=await fs.lstat(stageMovie);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<12||stat.size>MAX_MOVIE_BYTES)throw Error('Invalid or oversized rendered MP4');
  const h=await fs.open(stageMovie,FS_CONSTANTS.O_RDONLY|FS_CONSTANTS.O_NOFOLLOW);
  try{const header=Buffer.alloc(12);if((await h.read(header,0,12,0)).bytesRead!==12||header.toString('ascii',4,8)!=='ftyp')throw Error('Rendered output is not an MP4 file')}finally{await h.close()}
  const finalPath=path.join(plan.outputRoot,config.outputName);
  // Hard links work on APFS but NOT on Jarvis's ExFAT Expansion drive.
  // COPYFILE_EXCL provides a no-overwrite fallback: existing movies are never
  // replaced, and the newly copied movie is checked before it is reported as
  // complete. A process crash during the fallback may leave a partial MP4;
  // its non-completion is never reported as a finished render.
  try{
   await fs.link(stageMovie,finalPath);
  }catch(error){
   if(!['ENOTSUP','EOPNOTSUPP','ENOSYS','EPERM','EINVAL'].includes(error.code))throw error;
   let copied=false;
   try{
    await fs.copyFile(stageMovie,finalPath,FS_CONSTANTS.COPYFILE_EXCL);
    copied=true;
    const published=await fs.lstat(finalPath);
    if(!published.isFile()||published.isSymbolicLink()||published.size!==stat.size)throw Error('Published MP4 size verification failed');
    if(await fileDigest(stageMovie)!==await fileDigest(finalPath))throw Error('Published MP4 checksum verification failed');
    const handle=await fs.open(finalPath,'r');
    try{await handle.sync()}finally{await handle.close()}
   }catch(copyError){
    // Never delete an independently existing destination on an EEXIST race.
    if(copied||copyError.code!=='EEXIST')await fs.rm(finalPath,{force:true}).catch(()=>{});
    throw copyError;
   }
  }
  return {outputPath:finalPath,outputName:config.outputName,bytes:stat.size,frameCount:staging.length,readOnlySources:true,rendered:true};
 }finally{await fs.rm(stageRoot,{recursive:true,force:true})}
}
