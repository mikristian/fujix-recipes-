import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import {normalizeStagedRecipe} from './recipe-hub-store.mjs';

export const INTAKE_MAX_BYTES=1024*1024;
const block=new net.BlockList();
for(const [network,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])block.addSubnet(network,prefix,'ipv4');
for(const [network,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]])block.addSubnet(network,prefix,'ipv6');
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,n)=>{const x=Number(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):''}).replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39);/gi,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&#39;':"'"}[m.toLowerCase()]||m)).replace(/\s+/g,' ').trim();
const plain=s=>decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
const clean=s=>decode(s).slice(0,1800);
const attr=(tag,name)=>{const m=tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i'));return m?decode(m[1]??m[2]??m[3]):'';};
const meta=(html,key)=>{for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){if((attr(tag,'property')||attr(tag,'name')).toLowerCase()===key.toLowerCase())return attr(tag,'content');}return '';};
const tagText=(html,tag)=>plain(html.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]||'');
const sentences=s=>clean(s).split(/(?<=[.!?])\s+/).filter(x=>x.length>25);
// Short, clearly attributed source notes. Avoid storing lengthy article passages.
const contextualSummary=s=>{
 const first=sentences(s)[0]||'';
 if(!first)return '';
 const words=first.split(/\s+/).slice(0,19).join(' ');
 return words+(first.split(/\s+/).length>19?'…':'');
};

export function validatePublicUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)throw new Error('Invalid URL');
 let u;try{u=new URL(raw)}catch{throw new Error('Invalid URL')}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw new Error('Only public HTTPS URLs are allowed');
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||net.isIP(host)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example')||host.endsWith('.onion')||host.endsWith('.home')||host.endsWith('.lan'))throw new Error('Local or internal destination blocked');
 if(u.hash)u.hash='';
 return u;
}

export async function resolvePublicHost(host,{lookup=dns.lookup}={}){
 const addresses=await lookup(host,{all:true,verbatim:true});
 if(!Array.isArray(addresses)||!addresses.length)throw new Error('Host did not resolve');
 for(const entry of addresses){
  if(!entry||!net.isIP(entry.address)||block.check(entry.address,net.isIP(entry.address)===4?'ipv4':'ipv6'))throw new Error('Private or reserved network blocked');
 }
 return addresses[0];
}

function nativeFetch(url,{address,timeoutMs,maxBytes}){
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:'GET',headers:{accept:'text/html,application/xhtml+xml','user-agent':'FujiXSyncRecipeHub/1.0','accept-encoding':'identity'},timeout:timeoutMs,maxHeaderSize:16384,lookup:createPinnedLookup(address),rejectUnauthorized:true},res=>{
   const chunks=[];let total=0;
   res.on('data',chunk=>{total+=chunk.length;if(total>maxBytes){req.destroy(new Error('Article exceeds intake size limit'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('timeout',()=>req.destroy(new Error('Article request timed out')));
  req.on('error',reject);req.end();
 });
}

// Node's default autoSelectFamily requests lookup({all:true}), which requires
// an array of {address,family} records. Keep the already vetted address pinned
// through connect; never resolve the hostname again inside https.request.
export function createPinnedLookup(address){
 if(!address||net.isIP(address.address)!==address.family)throw new Error('Invalid pinned DNS address');
 return (_hostname,options,callback)=>{
  if(typeof options==='function'){callback=options;options={};}
  if(options?.all)callback(null,[{address:address.address,family:address.family}]);
  else callback(null,address.address,address.family);
 };
}

function extractSettings(html){
 const settings={};
 const keys=[['filmSimulation','Film Simulation'],['dynamicRange','Dynamic Range'],['grainEffect','Grain Effect'],['colorChromeEffect','Color Chrome Effect'],['colorChromeFxBlue','Color Chrome FX Blue'],['whiteBalance','White Balance'],['highlight','Highlight'],['shadow','Shadow'],['color','Color'],['sharpness','Sharpness'],['noiseReduction','High ISO NR|Noise Reduction'],['clarity','Clarity'],['iso','ISO'],['exposureCompensation','Exposure Compensation']];
 const article=html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi,'').replace(/<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg)>/gi,'');
 const lines=article.replace(/<br\s*\/?\s*>|<\/(?:p|li|div|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,' ');
 // Settings require explicit article labels and tightly bounded value delimiters.
 for(const [key,label] of keys){
  const re=new RegExp('(?:^|[\\n\\r])\\s*(?:'+label+')\\s*:\\s*([^\\n\\r]{1,100})','im');
  const rawMatch=lines.match(re);
  if(!rawMatch)continue;
  const value=clean(rawMatch[1]).slice(0,90);
  if(value&&value.length>=1&&value.length<=90)settings[key]=value;
 }
 return settings;
}

export function parseRecipeArticle(html,sourceUrl){
 if(typeof html!=='string'||Buffer.byteLength(html)>INTAKE_MAX_BYTES)throw new Error('Invalid or oversized article HTML');
 const title=meta(html,'og:title')||tagText(html,'h1')||tagText(html,'title');
 if(!title)throw new Error('Article has no recognizable title');
 const author=meta(html,'author')||meta(html,'article:author')||'';
 const description=meta(html,'og:description')||meta(html,'description');
 const paragraphs=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(x=>plain(x[1])).filter(x=>x.length>65&&!/cookie|privacy policy|subscribe|affiliate|newsletter/i.test(x)).slice(0,16);
 const summary=contextualSummary(description||paragraphs[0]||'');
 const background=contextualSummary(paragraphs.find(p=>p!==description&&/inspir|film|color|look|develop|style|photograph|classic|original|created|recipe/i.test(p))||paragraphs[1]||'');
 let imageUrl=null;
 const image=meta(html,'og:image')||meta(html,'twitter:image');
 if(image){try{const u=validatePublicUrl(new URL(image,sourceUrl).href);imageUrl=u.href}catch{}}
 return normalizeStagedRecipe({title,author,summary,background,sourceUrl,imageUrl,settings:extractSettings(html)});
}

export async function intakeRecipeUrl(raw,{fetchImpl,lookup=dns.lookup,maxBytes=INTAKE_MAX_BYTES,timeoutMs=8000,maxRedirects=3}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>INTAKE_MAX_BYTES)throw new Error('Invalid intake cap');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)throw new Error('Invalid time limit');
 let url=validatePublicUrl(raw);
 for(let redirects=0;redirects<=maxRedirects;redirects++){
  const address=await resolvePublicHost(url.hostname,{lookup});
  const response=await (fetchImpl?fetchImpl(url.href,{redirect:'manual',address,timeoutMs,maxBytes}):nativeFetch(url,{address,timeoutMs,maxBytes}));
  const status=response.status;
  const getHeader=k=>typeof response.headers?.get==='function'?response.headers.get(k):response.headers?.[k]||response.headers?.[k.toLowerCase()];
  if([301,302,303,307,308].includes(status)){
   if(redirects===maxRedirects)throw new Error('Too many article redirects');
   const location=getHeader('location');if(!location)throw new Error('Redirect missing location');
   url=validatePublicUrl(new URL(location,url).href);continue;
  }
  if(status!==200)throw new Error('Article request failed ('+status+')');
  const type=String(getHeader('content-type')||'text/html').toLowerCase();
  if(!/^text\/html(?:;|$)|^application\/xhtml\+xml(?:;|$)/.test(type))throw new Error('Source is not an HTML article');
  const contentLength=Number(getHeader('content-length'));if(contentLength>maxBytes)throw new Error('Article exceeds intake size limit');
  const body=typeof response.body==='string'?response.body:typeof response.text==='function'?await response.text():null;
  if(typeof body!=='string'||Buffer.byteLength(body)>maxBytes)throw new Error('Article exceeds intake size limit');
  return {recipe:parseRecipeArticle(body,url.href)};
 }
 throw new Error('Too many article redirects');
}
