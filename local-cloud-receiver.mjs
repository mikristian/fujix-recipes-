/** FujiX Sync's opt-in, local-network-only image receiver.
 * Does not impersonate Frame.io or claim the X100VI can push directly to it.
 * A trusted LAN sender (phone companion, manual upload, future authenticated
 * camera bridge) may send original bytes. Reuses the Mac's signature-checking
 * LocalPhotoLibrary, which never deletes or modifies camera SD files.
 */
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {LocalPhotoLibrary} from './local-photo-library.mjs';

const VALID_NAME=/^[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.(?:jpe?g|raf|png|heic|heif|tiff?)$/i;
const MAX_ACTIVE_UPLOADS=2;
const SUPPORTED_PORT=4195;
const PRIVATE_IP=/^(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})$/;

export function safeOriginalFilename(name){
  return typeof name==='string'&&VALID_NAME.test(name)&&name!=='..'&&name!=='.' ? name : null;
}
function ipBytes(ip){
  if(net.isIP(ip)!==4)return null;
  return ip.split('.').map(Number);
}
function sameLocalSubnet(client,host){
  if(client?.startsWith('::ffff:'))client=client.slice(7);
  const a=ipBytes(client),b=ipBytes(host);
  return !!a&&!!b&&a.slice(0,3).every((x,i)=>x===b[i]);
}
const CLIENT_SCRIPT=`'use strict';
const form=document.getElementById('upload-form');
const status=document.getElementById('upload-status');
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const key=document.getElementById('key').value.trim();
 const files=[...document.getElementById('photos').files];
 if(!key||!files.length){status.textContent='Enter the pairing key and select your files.';return;}
 const submit=document.getElementById('upload');submit.disabled=true;
 let completed=0;
 try{
  for(const file of files){
   status.textContent='Uploading '+(completed+1)+' of '+files.length+': '+file.name;
   const response=await fetch('/api/upload?name='+encodeURIComponent(file.name),{
    method:'POST',headers:{'X-FujiX-Key':key,'Content-Type':'application/octet-stream'},body:file
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'File rejected');
   completed++;
  }
  status.textContent='Saved '+completed+' complete original file(s) to FujiX Sync on the Mac.';
  form.reset();
 }catch(error){status.textContent='Saved '+completed+' file(s). '+error.message}
 finally{submit.disabled=false}
});`;

const UPLOAD_PAGE=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FujiX Sync Local Cloud</title><style>body{font:15px system-ui;color:#e9eef4;background:#10151c;margin:0;padding:28px}main{max-width:550px;margin:4vh auto;background:#19232f;border:1px solid #365270;border-radius:17px;padding:25px}h1{font-size:24px;margin:0 0 8px}p{line-height:1.55;color:#b9c9d8}label{display:block;font-weight:650;margin:17px 0 7px}input{display:block;width:100%;box-sizing:border-box;padding:12px;color:#fff;background:#0b1520;border:1px solid #66829a;border-radius:8px}button{margin-top:20px;padding:12px 18px;border:0;border-radius:8px;color:#08111b;background:#64c5ff;font-weight:700;cursor:pointer}button:disabled{opacity:.5}small{display:block;color:#95a9bc;margin-top:15px}#upload-status{margin-top:15px;min-height:40px}</style></head><body><main>
<h1>FujiX Sync Local Cloud</h1><p>Send original RAW or JPEG images from a phone or another device on the same trusted home Wi-Fi to your Mac. No Frame.io account or internet upload is used. This page does not connect directly to a Fujifilm camera.</p>
<form id="upload-form"><label for="key">Mac pairing key</label><input id="key" type="password" autocomplete="off" spellcheck="false" required placeholder="Key shown in FujiX Sync on your Mac">
<label for="photos">Photos (RAF / JPEG / HEIF / TIFF / PNG)</label><input id="photos" type="file" multiple required accept=".raf,.jpg,.jpeg,.png,.heif,.heic,.tif,.tiff"><button id="upload" type="submit">Send originals to Mac</button></form>
<p id="upload-status" role="status" aria-live="polite"></p><small>Use only on a trusted private LAN. This local receiver uses HTTP, not end-to-end HTTPS. Camera SD files are not changed.</small></main><script src="/client.js" defer></script></body></html>`;

export class LocalCloudReceiver {
  constructor({library=new LocalPhotoLibrary(),port=SUPPORTED_PORT}={}){
    this.library=library;this.port=port;this.server=null;this.host=null;this.key=null;
    this.received=0;this.bytes=0;this.lastArrival=null;this.activeUploads=0;
  }
  status(){return {active:!!this.server,host:this.host,port:this.server?.address()?.port||this.port,
    url:this.server?`http://${this.host}:${this.server.address().port}/`:null,received:this.received,bytes:this.bytes,
    lastArrival:this.lastArrival,activeUploads:this.activeUploads,
    cameraDirectUploadVerified:false,transport:'trusted-home-lan',
    note:'Local original-image receiver only. The X100VI Frame.io uploader cannot be pointed here through normal camera settings. Use a phone/file bridge until a verified camera-compatible sender exists.'};}
  async start({host}={}){
    if(this.server)throw Error('Local Cloud is already running. Stop it first to rotate the pairing key.');
    if(net.isIP(host)!==4||!(host==='127.0.0.1'||PRIVATE_IP.test(host)))throw Error('Local Cloud must bind to the Mac local IPv4 address.');
    await this.library.prepare();
    this.key=crypto.randomBytes(24).toString('hex');
    this.host=host;this.received=0;this.bytes=0;this.lastArrival=null;
    const server=http.createServer((req,res)=>void this.handle(req,res).catch(()=>this.respond(res,500,{error:'Local Cloud request failed.'})));
    this.server=server;
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.port,host,resolve)});
      return {...this.status(),pairingKey:this.key};
    }catch(error){this.server=null;this.key=null;this.host=null;throw error}
  }
  async stop(){
    const server=this.server;
    this.server=null;this.key=null;this.host=null;
    if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
    return this.status();
  }
  respond(res,code,body){
    if(res.headersSent||res.writableEnded)return;
    res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));
  }
  authorized(req){
    const supplied=req.headers['x-fujix-key'];
    if(typeof supplied!=='string'||!this.key||supplied.length!==this.key.length)return false;
    return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(this.key));
  }
  async handle(req,res){
    // Bound to a particular private-interface address, and clients must be
    // from the same /24. No CORS, no proxy headers, no router configuration.
    if(this.host!=='127.0.0.1'&&!sameLocalSubnet(req.socket.remoteAddress,this.host)){
      this.respond(res,403,{error:'Sender is not on the same local network.'});return;
    }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'"});
      res.end(UPLOAD_PAGE);return;
    }
    if(req.method==='GET'&&url.pathname==='/client.js'){
      res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(CLIENT_SCRIPT);return;
    }
    if(req.method==='GET'&&url.pathname==='/health'){this.respond(res,200,{ready:true,mode:'local-cloud-receiver',cameraDirectUploadVerified:false});return}
    if(req.method==='GET'&&url.pathname==='/api/status'){
      if(!this.authorized(req)){this.respond(res,401,{error:'Pairing key required.'});return}
      this.respond(res,200,this.status());return;
    }
    if(req.method==='POST'&&url.pathname==='/api/upload'){
      // Disallow cross-origin browser requests: only this page or direct API
      // clients with the secret can submit images. No cross-origin preflight.
      const origin=req.headers.origin;
      if(origin&&origin!==`http://${this.host}:${this.server.address().port}`){
        this.respond(res,403,{error:'Use the Local Cloud page on this Mac.'});return;
      }
      if(!this.authorized(req)){this.respond(res,401,{error:'Invalid pairing key.'});return}
      const filename=safeOriginalFilename(url.searchParams.get('name'));
      if(!filename){this.respond(res,415,{error:'Use a JPEG, RAF, HEIF, PNG or TIFF photo file.'});return}
      if(this.activeUploads>=MAX_ACTIVE_UPLOADS){this.respond(res,429,{error:'Two transfers are already in progress.'});return}
      this.activeUploads++;
      try{
        const saved=await this.library.write(req,{kind:'original',filename});
        this.received++;this.bytes+=saved.bytes;
        this.lastArrival={name:saved.name,bytes:saved.bytes,at:Date.now(),id:saved.id};
        this.respond(res,201,{ok:true,name:saved.name,bytes:saved.bytes,library:'FujiX Sync Originals'});
      }catch(error){this.respond(res,422,{error:String(error?.message||error).slice(0,180)})}
      finally{this.activeUploads--}
      return;
    }
    this.respond(res,404,{error:'Not found.'});
  }
}
