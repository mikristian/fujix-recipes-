/** One-click Mac shutter + photo review; never mislabels a webcam frame as a still. */
export class ShotReviewMatcher{
 constructor(){this.known=new Set();this.pending=[];this.next=0}
 prime(files){for(const file of files||[])if(typeof file?.id==='string')this.known.add(file.id)}
 arm(at=Date.now()){const shot={id:++this.next,at};this.pending.push(shot);return shot}
 cancel(id){this.pending=this.pending.filter(s=>s.id!==id)}
 expire(cutoff){const old=this.pending.length;this.pending=this.pending.filter(s=>s.at>=cutoff);return old-this.pending.length}
 consume(files){
  const incoming=(files||[]).filter(f=>typeof f?.id==='string'&&!this.known.has(f.id));
  for(const f of incoming)this.known.add(f.id);
  const matches=[];
  for(const f of [...incoming].reverse())if(this.pending.length)matches.push({shot:this.pending.shift(),photo:f});
  return matches;
 }
}
export function verifiedX100viVideo(doc){
 const video=doc.querySelector('video[data-testid="fujix-live-video"]');
 const track=video?.srcObject?.getVideoTracks?.()[0];
 const selected=doc.querySelector('#fujix-video-source');
 const mode=doc.querySelector('#fujix-live-mode-direct');
 const deviceId=track?.getSettings?.()?.deviceId;
 if(mode?.getAttribute('aria-pressed')!=='true'||track?.readyState!=='live'||
    !/\bX100VI\b/i.test(track.label||'')||video.videoWidth<128||video.videoHeight<128||
    !/\bX100VI\b/i.test(selected?.selectedOptions?.[0]?.textContent||'')||
    (deviceId&&deviceId!==selected?.value))return null;
 return video;
}
async function api(url,options){
 const response=await fetch(url,options);const data=await response.json();
 if(!response.ok)throw Error(data.error||'Local camera service failed.');
 return data;
}
if(typeof document!=='undefined'&&['localhost','127.0.0.1'].includes(location.hostname)){
 const matcher=new ShotReviewMatcher();
 let primed=false,submitting=false,originalShown=false,originalWatchBusy=false;
 const dock=document.createElement('section');
 dock.id='fujix-capture-dock';dock.hidden=true;dock.setAttribute('aria-label','FujiX Sync Shoot and Review');
 dock.innerHTML='<div class="fujix-capture-head"><b>X100VI · Shoot & Review</b><button id="fujix-capture-toggle" type="button" aria-expanded="false">Open tools ▾</button></div>'+
 '<div id="fujix-capture-body"><button id="fujix-capture-shoot" type="button">Shoot X100VI & show photo</button>'+
 '<p id="fujix-capture-status" role="status" aria-live="polite">Connect Bluetooth shutter in Library.</p>'+
 '<div id="fujix-capture-display" hidden><img alt="Verified X100VI video frame or transferred camera image"/>'+
 '<p id="fujix-capture-caption"></p><a id="fujix-capture-download" download>Download image</a></div>'+
 '<div class="fujix-capture-bottom"><span id="fujix-capture-pending">0 originals pending</span><button id="fujix-capture-refresh" type="button">Check originals</button></div>'+
 '<small>USB live frames are previews, NOT actual saved photos. Only transferred camera files are labeled originals.</small></div>';
 document.body.append(dock);
 const body=dock.querySelector('#fujix-capture-body');
 body.hidden=true;
 const btn=dock.querySelector('#fujix-capture-shoot');
 const status=dock.querySelector('#fujix-capture-status');
 const pending=dock.querySelector('#fujix-capture-pending');
 const viewer=dock.querySelector('#fujix-capture-display');
 const image=viewer.querySelector('img');
 const caption=dock.querySelector('#fujix-capture-caption');
 const download=dock.querySelector('#fujix-capture-download');
 const library=()=>Boolean(document.querySelector('#fujix-library-live-monitor'));
 const show=(url,name,description,kind)=>{
  viewer.hidden=false;viewer.dataset.kind=kind;
  if(url&&kind!=='raw-original'){image.src=url;image.hidden=false}else{image.removeAttribute('src');image.hidden=true}
  caption.textContent=description;download.href=url||'';download.download=name;download.hidden=!url;
 };
 const updatePending=()=>{pending.textContent=matcher.pending.length+' original'+(matcher.pending.length===1?'':'s')+' awaiting transfer'};
 async function latestInbox(){return (await api('/api/tether/inbox',{cache:'no-store'})).files||[]}
 async function checkOriginals(){
  if(!library()||originalWatchBusy)return;
  originalWatchBusy=true;
  try{
   const expired=matcher.expire(Date.now()-120000);
   if(expired)status.textContent='Camera original not received within two minutes. Preview (if shown) is not the actual camera still. Check X100VI Wi-Fi gallery connection.';
   const files=await latestInbox();
   if(!primed){matcher.prime(files);primed=true;return}
   const matches=matcher.consume(files);
   if(matches.length){
    const photo=matches.at(-1).photo;originalShown=true;
    const jpg=/\.(jpe?g|png)$/i.test(photo.name);
    const url='/api/tether/files/'+photo.id+(jpg?'?preview=1':'');
    show(jpg?url:null,photo.name,'New camera original received after a shutter request: '+photo.name,jpg?'original':'raw-original');
    if(!jpg){download.href=url;download.hidden=false}
    status.textContent='New original available on the Mac: '+photo.name+'. This transfer followed a shutter command; precise shot-to-file identity is not yet hardware-verified.';
   }
   updatePending();
  }catch{/* Original-photo transport may be unavailable; keep shutter and previews working. */}
  finally{originalWatchBusy=false}
 }
 async function saveUsbReference(){
  const video=verifiedX100viVideo(document);if(!video)return null;
  const canvas=document.createElement('canvas');
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Camera live-video pixel access unavailable');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.93));
  if(!blob||blob.size<128)throw Error('No valid video frame received');
  const result=await api('/api/usb/photos/capture',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
  if(result.photo?.isOriginal!==false||!result.photo.previewUrl)throw Error('The Mac did not verify the preview JPEG');
  return result.photo;
 }
 async function pressShutter(){
  if(submitting)return;
  const originalBtn=document.querySelector('#fujix-shutter-release');
  if(!originalBtn||originalBtn.disabled){
   status.textContent='Connect X100VI via Bluetooth first. No shutter command has been sent.';return;
  }
  submitting=true;btn.disabled=true;originalShown=false;
  if(!primed)try{matcher.prime(await latestInbox());primed=true}catch{}
  const shot=matcher.arm();updatePending();
  status.textContent='Requesting real X100VI Bluetooth/USB shutter release…';
  let removeListener=()=>{};
  const completed=new Promise((resolve,reject)=>{
   const onResult=event=>{clearTimeout(timeout);window.removeEventListener('fujix:x100vi-shutter-result',onResult);resolve(event.detail||{})};
   const timeout=setTimeout(()=>{window.removeEventListener('fujix:x100vi-shutter-result',onResult);reject(Error('Shutter result timed out; no still photograph has been verified.'))},12000);
   window.addEventListener('fujix:x100vi-shutter-result',onResult,{once:true});
   removeListener=()=>{clearTimeout(timeout);window.removeEventListener('fujix:x100vi-shutter-result',onResult)};
  });
  try{
   originalBtn.click();
   const result=await completed;
   if(!result.commandAccepted)throw Error(result.error||'Shutter command was not accepted.');
   status.textContent='Shutter command acknowledged. Checking original transfer and optional USB preview…';
   await new Promise(resolve=>setTimeout(resolve,150));
   try{
    const photo=await saveUsbReference();
    if(photo&&!originalShown){
     show(photo.previewUrl,photo.name,'X100VI USB video preview, not the full-resolution camera still.','usb-preview');
     status.textContent='Live preview saved to Mac. Waiting for actual camera original via direct gallery transfer.';
    }else if(!photo&&!originalShown){
     status.textContent='Shutter command acknowledged; no live USB preview. A real original will appear here only after camera transfer.';
    }
   }catch(err){status.textContent='Shutter acknowledged but video preview could not be saved: '+err.message}
   void checkOriginals();
  }catch(err){matcher.cancel(shot.id);status.textContent=err.message||'Shutter release failed. No photo verified.';updatePending()}
  finally{removeListener();submitting=false;btn.disabled=false}
 }
 btn.addEventListener('click',()=>{
  // FujiX Sync now provides authenticated native CoreBluetooth shooting.
  // Route this older dock into the same live reviewer / photo picker instead
  // of requiring a second browser-only Bluetooth pairing.
  const launcher=document.getElementById('fujix-live-pick-launch');
  const nativeShoot=document.getElementById('fxlp-shoot');
  if(launcher&&!launcher.hidden&&nativeShoot){
   launcher.click();
   nativeShoot.click();
   status.textContent='Opened Live Shoot & Pick for native Mac Bluetooth shutter and photo review.';
  }else void pressShutter();
 });
 dock.querySelector('#fujix-capture-refresh').addEventListener('click',()=>void checkOriginals());
 dock.querySelector('#fujix-capture-toggle').addEventListener('click',()=>{
  body.hidden=!body.hidden;
  const control=dock.querySelector('#fujix-capture-toggle');
  control.textContent=body.hidden?'Open tools ▾':'Close tools ▴';control.setAttribute('aria-expanded',String(!body.hidden));
 });
 const tick=()=>{
  // Only mount inside the Library panel's dedicated React placeholder.
  // No fixed-position popup, no automatic camera connection or shot.
  const inlineTarget=document.querySelector('#fujix-capture-inline-target');
  if(inlineTarget&&dock.parentElement!==inlineTarget)inlineTarget.append(dock);
  dock.hidden=!inlineTarget;
  if(!dock.hidden)void checkOriginals();
 };
 setInterval(tick,2500);tick();
}
