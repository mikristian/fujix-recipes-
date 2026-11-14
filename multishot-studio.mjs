/** Offline X100VI multishot index and project recipes. No filesystem writes. */
import path from 'node:path';

export const MULTISHOT_TYPES = Object.freeze(['film-simulation','focus','ae','interval']);
const EXTENSIONS = new Set(['.raf','.jpg','.jpeg','.png','.heic','.heif','.tif','.tiff']);
const DEFAULTS = Object.freeze({'film-simulation':2500,focus:4000,ae:3500,interval:120000});

function string(value,label){if(typeof value!=='string'||!value.trim())throw new TypeError(`${label} must be a nonempty string`);return value}

/** Validate a POSIX relative source name; preserve its spelling and subdirectories. */
export function validateSourcePath(sourcePath){
 string(sourcePath,'source path');
 if(sourcePath.includes('\\')||sourcePath.includes('\0')||sourcePath.startsWith('/')||/^[a-zA-Z]:/.test(sourcePath)||sourcePath.includes('?')||sourcePath.includes('#'))throw new Error('Unsafe source path');
 const parts=sourcePath.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'||/[\u0000-\u001f\u007f]/.test(part)))throw new Error('Unsafe source path');
 if(!EXTENSIONS.has(path.posix.extname(sourcePath).toLowerCase()))throw new Error('Unsupported source image extension');
 return sourcePath;
}

function time(value){
 const stamp=typeof value==='number'?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
 if(!Number.isFinite(stamp)||stamp<0)throw new Error('Invalid captureTime; use ISO-8601 with an explicit timezone or epoch milliseconds');
 if(typeof value==='string'&&!/(?:Z|[+-]\d\d:\d\d)$/i.test(value))throw new Error('captureTime requires an explicit timezone');
 return stamp;
}

function optionalInt(value,label,min=0){if(value===undefined||value===null)return null;if(!Number.isSafeInteger(value)||value<min)throw new Error(`${label} must be an integer >= ${min}`);return value}

function normalize(raw,index){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`Invalid source entry ${index}`);
 const sourcePath=validateSourcePath(raw.path);
 const type=raw.type==null?null:string(raw.type,'type');
 if(type!==null&&!MULTISHOT_TYPES.includes(type))throw new Error(`Unsupported multishot type ${type}`);
 const eventId=string(raw.eventId,'eventId');
 const captureMs=time(raw.captureTime);
 const sequenceIndex=optionalInt(raw.sequenceIndex,'sequenceIndex');
 const expectedCount=optionalInt(raw.expectedCount,'expectedCount',1);
 const seriesId=raw.seriesId==null?null:string(raw.seriesId,'seriesId');
 if(expectedCount!==null&&sequenceIndex!==null&&sequenceIndex>=expectedCount)throw new Error('sequenceIndex exceeds expectedCount');
 return {path:sourcePath,eventId,type,captureTime:new Date(captureMs).toISOString(),captureMs,sequenceIndex,expectedCount,seriesId,metadata:raw.metadata&&typeof raw.metadata==='object'&&!Array.isArray(raw.metadata)?structuredClone(raw.metadata):{}};
}

export function validateMultishotManifest(manifest){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||manifest.version!==1||!Array.isArray(manifest.sources))throw new Error('Expected manifest {version:1,sources:[...]}');
 const sources=manifest.sources.map(normalize);
 const used=new Set();
 for(const source of sources){if(used.has(source.path))throw new Error(`Duplicate source path: ${source.path}`);used.add(source.path)}
 return {version:1,sources};
}

const keyPart=value=>`${String(value).length}:${value}`;
const groupKey=(...parts)=>parts.map(keyPart).join('|');
function summarize(items,key,method,options){
 const ordered=[...items].sort((a,b)=>a.sequenceIndex!=null&&b.sequenceIndex!=null?a.sequenceIndex-b.sequenceIndex||a.captureMs-b.captureMs:a.captureMs-b.captureMs||a.path.localeCompare(b.path));
 const counts=[...new Set(ordered.map(x=>x.expectedCount).filter(x=>x!==null))];
 const expectedCount=counts.length===1?counts[0]:null;
 const indices=ordered.map(x=>x.sequenceIndex).filter(x=>x!==null);
 const duplicates=indices.filter((v,i)=>indices.indexOf(v)!==i);
 const missingIndices=expectedCount!==null?Array.from({length:expectedCount},(_,i)=>i).filter(i=>!indices.includes(i)):[];
 const warnings=[];
 if(counts.length>1)warnings.push('Conflicting declared expectedCount values');
 if(duplicates.length)warnings.push('Duplicate sequenceIndex values');
 if(expectedCount!==null&&(ordered.length!==expectedCount||missingIndices.length))warnings.push('Incomplete declared sequence');
 if(method==='capture-time proximity')warnings.push(`Heuristic grouping within ${options.windowMs} ms; confirm visually before use`);
 if(expectedCount===null)warnings.push('Completeness unknown: expectedCount not declared consistently');
 return {id:key,type:ordered[0].type,eventId:ordered[0].eventId,seriesId:ordered[0].seriesId,method,expectedCount,complete:expectedCount!==null&&ordered.length===expectedCount&&missingIndices.length===0&&duplicates.length===0&&counts.length===1,missingIndices,warnings,photos:ordered.map(({captureMs,...photo})=>photo)};
}

/** A declared seriesId takes precedence. Remaining entries group by same event and type,
 *  with capture proximity, capped by declared expectedCount when present. No cross-event mixing.
 */
export function groupMultishotManifest(manifest,{windowMs={}}={}){
 const {sources}=validateMultishotManifest(manifest);
 const collected=new Map(),undecided=new Map();
 for(const source of sources){
  const explicit=source.seriesId!==null;
  const key=groupKey(source.eventId,source.type??'unclassified',...(explicit?['series',source.seriesId]:['undecided']));
  const target=explicit?collected:undecided;
  if(!target.has(key))target.set(key,[]);
  target.get(key).push(source);
 }
 const groups=[];
 for(const [key,entries] of collected)groups.push(summarize(entries,key,'declared seriesId',{}));
 for(const [key,entries] of undecided){
  const ordered=[...entries].sort((a,b)=>a.captureMs-b.captureMs||a.path.localeCompare(b.path));
  let current=[];
  for(const source of ordered){
   const ms=windowMs[source.type]??DEFAULTS[source.type]??0;
   if(!Number.isFinite(ms)||ms<0||ms>86400000)throw new Error('Invalid grouping windowMs');
   const prior=current.at(-1);
   const expected=current[0]?.expectedCount;
   const boundaries=prior&&(source.captureMs-prior.captureMs>ms||(expected!==null&&expected!==undefined&&current.length>=expected)||(source.sequenceIndex===0&&current.some(x=>x.sequenceIndex===0)));
   if(boundaries){groups.push(summarize(current,groupKey(key,groups.length),'capture-time proximity',{windowMs:ms}));current=[]}
   current.push(source);
  }
  if(current.length)groups.push(summarize(current,groupKey(key,groups.length),'capture-time proximity',{windowMs:windowMs[current[0].type]??DEFAULTS[current[0].type]??0}));
 }
 return groups.sort((a,b)=>a.photos[0].captureTime.localeCompare(b.photos[0].captureTime)||a.id.localeCompare(b.id));
}

export function createMultishotProject(manifest,options={}){
 const groups=groupMultishotManifest(manifest,options);
 return {schema:'fuji-x-multishot-project',version:1,generatedAt:null,nonDestructive:true,sourcePolicy:'Paths are relative to the user-selected photo root; originals are never modified',groups,unclassified:groups.filter(x=>x.type===null).length};
}

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/** A portable contact sheet with no remote assets, scripts, or local file reads. */
export function createContactSheetHtml(project){
 if(!project||project.schema!=='fuji-x-multishot-project'||!Array.isArray(project.groups))throw new Error('Expected multishot project');
 const content=project.groups.map(group=>`<section><h2>${escapeHtml(group.type??'Unclassified')} — ${escapeHtml(group.eventId)}</h2><p>${escapeHtml(group.method)} · ${group.complete?'complete':'unverified or incomplete'}</p><ol>${group.photos.map(p=>`<li><span>${escapeHtml(p.path)}</span> <time>${escapeHtml(p.captureTime)}</time>${p.sequenceIndex===null?'':` <small>#${escapeHtml(p.sequenceIndex)}</small>`}</li>`).join('')}</ol>${group.warnings.map(w=>`<p class="warning">${escapeHtml(w)}</p>`).join('')}</section>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Fuji X multishot contact sheet</title><style>body{font:16px system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#18202a}section{border:1px solid #ccd3d9;border-radius:10px;padding:1rem;margin:1rem 0}li{padding:.3rem;overflow-wrap:anywhere}.warning{color:#904018}time{font-size:.85em;color:#667}</style></head><body><h1>Multishot contact sheet index</h1><p>Offline source index. Paths are displayed as text; no photos are loaded or changed.</p>${content}</body></html>`;
}

/** Return argv tokens for a user-reviewed ffmpeg sequence from a preexisting numbered image series.
 *  This recipe is data only; no executable is launched and no images are written.
 */
export function createFfmpegRecipe({inputPattern,outputFile='timelapse.mp4',frameRate=24}={}){
 string(inputPattern,'inputPattern');string(outputFile,'outputFile');
 if(!/^[\w./ %-]+$/.test(inputPattern)||!inputPattern.includes('%0')||!/%0[1-9]\d*d/.test(inputPattern)||inputPattern.split('%').length!==2)throw new Error('inputPattern must contain exactly one numbered ffmpeg %0Nd placeholder and safe characters');
 if(!/^[\w./ -]+\.mp4$/i.test(outputFile)||outputFile.startsWith('-'))throw new Error('Unsafe outputFile');
 if(!Number.isInteger(frameRate)||frameRate<1||frameRate>120)throw new Error('frameRate must be 1..120');
 const pattern=inputPattern.replace(/%0[1-9]\d*d/,'0001');validateSourcePath(pattern);
 const outputParts=outputFile.split('/');if(outputParts.some(x=>!x||x==='.'||x==='..')||outputFile.startsWith('/'))throw new Error('Unsafe outputFile');
 return {tool:'ffmpeg',argv:['-framerate',String(frameRate),'-i',inputPattern,'-c:v','libx264','-pix_fmt','yuv420p',outputFile],note:'Preview command only. Requires a locally prepared sequential image series; review before running. Never modifies original photos.'};
}
