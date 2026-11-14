/** Read-only, bounded header and hash inspection of imported photos. No camera provenance claim. */
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export const DEFAULT_MAX_IMAGE_BYTES=512*1024*1024;
export const MAX_HEADER_BYTES=256*1024;
const FORMATS={'.raf':'raf','.jpg':'jpeg','.jpeg':'jpeg','.png':'png'};

export function validateImageRelativePath(filename){
 if(typeof filename!=='string'||!filename||filename.startsWith('/')||filename.includes('\\')||/^[A-Za-z]:/.test(filename)||/[\u0000-\u001f\u007f]/.test(filename))throw new Error('Unsafe image filename');
 const segments=filename.split('/');
 if(segments.some(segment=>!segment||segment==='.'||segment==='..'))throw new Error('Unsafe image filename');
 if(!FORMATS[path.posix.extname(filename).toLowerCase()])throw new Error('Unsupported image filename extension');
 return filename;
}

function inspectJpeg(data,total){
 if(data.length<4||data[0]!==0xff||data[1]!==0xd8)throw new Error('Invalid JPEG SOI header');
 let offset=2,dimensions=null,app1Exif=false,app0Jfif=false,markers=[],truncated=false;
 while(offset<data.length){
  if(data[offset]!==0xff){truncated=true;break}
  while(data[offset]===0xff)offset++;
  if(offset>=data.length){truncated=true;break}
  const marker=data[offset++];
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>data.length){truncated=true;break}
  const size=data.readUInt16BE(offset);
  if(size<2)throw new Error('Malformed JPEG marker length');
  const end=offset+size;
  if(end>total)throw new Error('JPEG marker exceeds file length');
  if(end>data.length){truncated=true;break}
  if(marker===0xe0&&size>=7&&data.toString('ascii',offset+2,offset+7)==='JFIF\0')app0Jfif=true;
  if(marker===0xe1&&size>=8&&data.toString('ascii',offset+2,offset+8)==='Exif\0\0')app1Exif=true;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){
   const height=data.readUInt16BE(offset+3),width=data.readUInt16BE(offset+5);
   if(!height||!width)throw new Error('Invalid JPEG dimensions');
   dimensions={width,height};
  }
  markers.push(marker.toString(16).padStart(2,'0'));offset=end;
 }
 return {format:'jpeg',mime:'image/jpeg',dimensions,metadata:{jfif:app0Jfif,exifPresent:app1Exif,segmentMarkers:markers.slice(0,64)},headerTruncated:truncated};
}

function inspectPng(data,total){
 if(data.length<33||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG signature');
 if(data.readUInt32BE(8)!==13||data.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG IHDR');
 const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
 if(!width||!height||!Number.isSafeInteger(width*height))throw new Error('Invalid PNG dimensions');
 const bitDepth=data[24],colorType=data[25],compression=data[26],filter=data[27],interlace=data[28];
 if(![0,2,3,4,6].includes(colorType)||compression!==0||filter!==0||interlace>1)throw new Error('Invalid PNG image settings');
 if(data.length>total)throw new Error('Invalid PNG length');
 return {format:'png',mime:'image/png',dimensions:{width,height},metadata:{bitDepth,colorType,interlace},headerTruncated:false};
}

function inspectRaf(data,total){
 if(data.length<100||data.toString('ascii',0,16)!=='FUJIFILMCCD-RAW ')throw new Error('Invalid Fujifilm RAF signature');
 const version=data.toString('ascii',16,20).replace(/\0/g,'');
 const cameraLabel=data.toString('ascii',20,52).replace(/\0.*$/,'').trim();
 const offsets=[];
 // Official RAF header offsets are big-endian 32-bit fields at 84..99.
 for(let pos=84;pos<=96;pos+=4)offsets.push(data.readUInt32BE(pos));
 const [previewOffset,previewLength,rawOffset,rawLength]=offsets;
 const warnings=[];
 for(const [name,start,size] of [['preview',previewOffset,previewLength],['raw',rawOffset,rawLength]]){
  if(start===0&&size===0)warnings.push(`${name} region not declared`);
  else if(!start||!size||start>total||size>total-start)warnings.push(`${name} region exceeds file bounds`);
 }
 return {format:'raf',mime:'application/octet-stream',dimensions:null,metadata:{rafVersion:version,cameraLabel:cameraLabel||null,previewOffset,previewLength,rawOffset,rawLength},warnings,headerTruncated:false};
}

export function sniffImageHeader(data,{filename=null,fileSize=data?.length}={}){
 if(!Buffer.isBuffer(data))throw new TypeError('Expected image header Buffer');
 if(!Number.isSafeInteger(fileSize)||fileSize<0||data.length>fileSize)throw new Error('Invalid file size');
 if(data.length>MAX_HEADER_BYTES)throw new Error('Header too large');
 const ext=filename==null?null:FORMATS[path.posix.extname(validateImageRelativePath(filename)).toLowerCase()];
 const format=data.length>=16&&data.toString('ascii',0,16)==='FUJIFILMCCD-RAW '?'raf':data.length>=2&&data[0]===0xff&&data[1]===0xd8?'jpeg':data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':null;
 if(!format)throw new Error('Unrecognized image header');
 if(ext&&format!==ext)throw new Error('Image content does not match extension');
 const report=format==='raf'?inspectRaf(data,fileSize):format==='jpeg'?inspectJpeg(data,fileSize):inspectPng(data,fileSize);
 return {...report,cameraOriginal:'unverified',provenance:'camera-original unverified: file bytes cannot establish camera capture or transfer origin'};
}

async function secureRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('Image root must be an absolute path');
 const canonical=await fs.realpath(root);
 const stat=await fs.lstat(canonical);
 if(!stat.isDirectory())throw new Error('Image root must be a directory');
 return canonical;
}

/** Inspect a file within a caller-selected root, opening without following symlinks.
 * No output files are produced; SHA-256 streams through the same read-only handle.
 */
export async function inspectOfflineImage({root,filename,maxBytes=DEFAULT_MAX_IMAGE_BYTES}={}){
 validateImageRelativePath(filename);
 if(!Number.isSafeInteger(maxBytes)||maxBytes<100||maxBytes>4*1024*1024*1024)throw new Error('Invalid maxBytes');
 const canonical=await secureRoot(root);
 const segments=filename.split('/');let directory=canonical;
 for(const segment of segments.slice(0,-1)){
  const next=path.join(directory,segment);const stat=await fs.lstat(next);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Unsafe image directory component');
  directory=next;
 }
 const absolute=path.join(directory,segments.at(-1));
 const lst=await fs.lstat(absolute);
 if(lst.isSymbolicLink()||!lst.isFile())throw new Error('Unsafe image file or symlink');
 const flags=(await import('node:fs')).constants.O_RDONLY|(await import('node:fs')).constants.O_NOFOLLOW;
 const handle=await fs.open(absolute,flags);
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.dev!==lst.dev||stat.ino!==lst.ino)throw new Error('Image changed during open');
  if(stat.size<16||stat.size>maxBytes)throw new Error('Image size outside inspection bounds');
  const header=Buffer.alloc(Math.min(stat.size,MAX_HEADER_BYTES));
  let filled=0;
  while(filled<header.length){const {bytesRead}=await handle.read(header,filled,header.length-filled,filled);if(!bytesRead)throw new Error('Incomplete header read');filled+=bytesRead}
  const details=sniffImageHeader(header,{filename,fileSize:stat.size});
  const sha=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
  let pos=0;
  while(pos<stat.size){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,stat.size-pos),pos);if(!bytesRead)throw new Error('Image truncated while hashing');sha.update(buffer.subarray(0,bytesRead));pos+=bytesRead}
  const afterward=await handle.stat();
  if(afterward.size!==stat.size||afterward.mtimeMs!==stat.mtimeMs||afterward.ino!==stat.ino||afterward.dev!==stat.dev)throw new Error('Image changed while inspecting');
  return {filename,bytes:stat.size,sha256:sha.digest('hex'),...details,readOnly:true};
 }finally{await handle.close()}
}
