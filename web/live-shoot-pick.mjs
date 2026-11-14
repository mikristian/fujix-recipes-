/** X100VI Live Shoot & Pick.
 * Reuses the verified X100VI USB video track already opened by FujiX Sync.
 * Does not create a second webcam, cannot read SD photos through USB WEBCAM,
 * and never identifies a UVC frame as the full-resolution camera exposure.
 */
import {captureInputIsAllowed,describeCaptureInput} from './capture-source.mjs';

export function verifiedX100viStream(doc){
 const video=doc?.querySelector?.('video[data-testid="fujix-live-video"]');
 const track=video?.srcObject?.getVideoTracks?.()[0];
 const mode=doc?.getElementById?.('fujix-live-mode-direct');
 const selected=doc?.getElementById?.('fujix-video-source');
 const cameraId=track?.getSettings?.()?.deviceId;
 if(mode?.getAttribute?.('aria-pressed')!=='true')return null;
 if(!track||track.readyState!=='live'||!/\bX100VI\b/i.test(track.label||''))return null;
 if(video.videoWidth<128||video.videoHeight<128||video.readyState<2)return null;
 if(cameraId&&selected?.value&&cameraId!==selected.value)return null;
 return video;
}
export function visibleReviewPhotos(files,filter='all',picked=[]){
 const favorite=new Set(picked);
 const valid=(files||[]).filter(file=>typeof file?.id==='string'&&/^[a-f0-9]{24}$/.test(file.id)&&
  typeof file.fileUrl==='string'&&file.fileUrl.startsWith('/api/usb/photos/file/'+file.id));
 const filtered=valid.filter(file=>filter==='original'?file.isOriginal===true:filter==='preview'?file.isOriginal===false:
  filter==='picked'?favorite.has(file.id):true);
 return [...filtered].sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
}
export const reviewFileLabel=file=>file?.isOriginal?'CAMERA ORIGINAL':'USB VIDEO PREVIEW — NOT THE STILL';

if(typeof document!=='undefined'&&['127.0.0.1','localhost'].includes(location.hostname)){
 const root=document.createElement('section');root.id='fujix-live-pick';root.hidden=true;
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','FujiX Sync live camera and photo selection');
 root.innerHTML=`<div class="fxlp-panel">
  <header class="fxlp-header"><div><h2>X100VI · Live Shoot & Pick</h2><p>Monitor the real Fuji video feed, trigger a camera shutter, review and pick your saved files.</p></div><button id="fxlp-close" type="button">Close</button></header>
  <div class="fxlp-controls">
   <button type="button" id="fxlp-shoot" class="fxlp-primary">Shoot on X100VI</button>
   <button type="button" id="fxlp-video-frame">Save live preview</button>
   <button type="button" id="fxlp-import">Import camera RAF / JPEG</button>
   <button type="button" id="fxlp-reload">Refresh gallery</button>
  </div>
  <div class="fxlp-input-controls" aria-label="Camera live-view source">
    <label for="fxlp-input-mode">Monitor source</label>
    <select id="fxlp-input-mode" aria-label="Monitor source"><option value="existing-usb">Existing FujiX X100VI USB WEBCAM stream</option><option value="usb-x100vi">Connect X100VI USB webcam directly</option><option value="external-hdmi">External HDMI capture adapter (manual identification)</option></select>
    <select id="fxlp-input-choice" aria-label="Camera video input"><option value="">Choose a video input after detection…</option></select>
    <button type="button" id="fxlp-detect-inputs">Detect inputs</button>
    <button type="button" id="fxlp-connect-input">Connect live input</button>
    <button type="button" id="fxlp-disconnect-input">Disconnect input</button>
  </div>
  <div class="fxlp-delivery-controls" aria-label="Automatic delivered-original monitoring">
    <span>After-shutter originals</span>
    <button type="button" id="fxlp-source-folder">Choose delivery folder</button>
    <button type="button" id="fxlp-watch-start">Auto-import delivered files</button>
    <button type="button" id="fxlp-watch-stop">Stop auto-import</button>
    <span id="fxlp-delivery-state" role="status">Not monitoring transferred originals</span>
  </div>
  <p id="fxlp-status" aria-live="polite" role="status">Checking X100VI live camera and Mac photo library…</p>
  <div class="fxlp-content">
   <div class="fxlp-main">
    <div class="fxlp-label"><span>Live camera monitor</span><span id="fxlp-live-size">USB connection required</span></div>
    <div class="fxlp-live-wrap"><video id="fxlp-live-video" autoplay muted playsinline></video><div id="fxlp-live-placeholder">No live camera video right now. Connect X100VI USB WEBCAM, or an external HDMI capture device. Neither video mode proves a full-resolution original transfer.</div><span id="fxlp-live-pill" class="fxlp-live-pill" hidden>LIVE VIDEO · NOT RAW</span></div>
    <div class="fxlp-review">
     <div class="fxlp-label"><span>Selected photo</span><span id="fxlp-selected-kind">Select a photo below</span></div>
     <div class="fxlp-review-surface"><img id="fxlp-review-image" alt="Selected FujiX Sync photo" hidden/><div id="fxlp-review-empty">Choose a photo from the thumbnails. RAF originals can be downloaded but do not display natively in Chrome.</div></div>
     <div class="fxlp-review-info"><span id="fxlp-review-meta">No photo selected</span><div class="fxlp-review-actions"><button id="fxlp-pick" type="button" disabled>Pick this photo ☆</button><a id="fxlp-download" href="#" hidden download>Download</a></div></div>
    </div>
   </div>
   <aside class="fxlp-sidebar">
    <div class="fxlp-sidebar-head"><span id="fxlp-count">Mac photos</span><select id="fxlp-filter" aria-label="Filter photos"><option value="all">All photos</option><option value="original">Camera originals</option><option value="preview">Video previews</option><option value="picked">My picks ★</option></select></div>
    <div id="fxlp-photos" aria-label="Choose a photo from the Mac gallery"></div>
   </aside>
  </div>
  <footer class="fxlp-footer">USB WEBCAM, HDMI capture and real RAF/JPEG delivery are separate camera paths. The X100VI does not support standard USB tethered photography; Fujifilm also says USB and HDMI cables cannot be used together. An HDMI adapter is manually chosen, not independently identified as an X100VI. After-shutter auto-import works only when Frame.io Drive (mounted/pre-cached) or another transfer app actually delivers readable files to your chosen Mac folder; it does not pull originals from USB WEBCAM. <a href="https://help.frame.io/en/articles/14501614-getting-started-with-frame-io-drive-mounted-storage" target="_blank" rel="noopener noreferrer">Frame.io Drive setup</a></footer>
 </div>`;
 document.body.append(root);
 const el=id=>root.querySelector('#'+id);
 const mirror=el('fxlp-live-video'),placeholder=el('fxlp-live-placeholder'),pill=el('fxlp-live-pill');
 const pickButton=el('fxlp-pick'),frameButton=el('fxlp-video-frame'),shutterButton=el('fxlp-shoot');
 const photoGrid=el('fxlp-photos'),status=el('fxlp-status'),preview=el('fxlp-review-image');
 const selectedKind=el('fxlp-selected-kind'),reviewMeta=el('fxlp-review-meta');
 const emptyReview=el('fxlp-review-empty'),download=el('fxlp-download');
 const launch=document.createElement('button');launch.id='fujix-live-pick-launch';launch.textContent='Live Shoot & Pick';launch.type='button';launch.hidden=true;
 const fileInput=document.createElement('input');fileInput.type='file';fileInput.multiple=true;fileInput.hidden=true;
 fileInput.accept='.raf,.jpg,.jpeg,.png,.heic,.heif,.tif,.tiff';document.body.append(fileInput);
 let allPhotos=[],selectedId=null,lastPhotoSignature='',lastSelectedId=null,busy=false,liveSource=null;
 let lastOriginalIds=new Set(),galleryReady=false,pendingShotUntil=0,active=false;
 let directStream=null,directMode=null,directDeviceId=null,directLabel=null;
 const inputMode=el('fxlp-input-mode'),inputChoice=el('fxlp-input-choice');
 const deliveryState=el('fxlp-delivery-state');
 const localKey='fujix:photo-picks:v1';
 let picked=new Set();
 try{const saved=JSON.parse(localStorage.getItem(localKey)||'[]');if(Array.isArray(saved))picked=new Set(saved.filter(v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v)).slice(0,200))}catch{}
 const setStatus=(message,isError=false)=>{status.textContent=message;status.style.color=isError?'#ffb4ab':'#b3d7ec'};
 const savePicks=()=>{try{localStorage.setItem(localKey,JSON.stringify([...picked]))}catch{}};
 const fileSignature=files=>files.map(f=>[f.id,f.createdAt,f.isOriginal].join(':')).join('|');
 const setBusy=value=>{busy=value;shutterButton.disabled=value;frameButton.disabled=value||!liveSource;el('fxlp-import').disabled=value};
 function disconnectManualSource(){
  if(directStream)for(const track of directStream.getTracks())track.stop();
  directStream=null;directMode=null;directDeviceId=null;directLabel=null;
  mirror.pause();mirror.srcObject=null;
  attachLive();
 }
 function directLiveVideo(){
  if(!directStream||mirror.srcObject!==directStream)return null;
  const track=directStream.getVideoTracks()[0];
  const actualId=track?.getSettings?.().deviceId||'';
  if(!captureInputIsAllowed({mode:directMode,label:track?.label||directLabel,
    chosenId:directDeviceId,actualId,trackState:track?.readyState,
    videoWidth:mirror.videoWidth,videoHeight:mirror.videoHeight,readyState:mirror.readyState}))return null;
  return mirror;
 }
 const currentVideo=()=>directLiveVideo()||(!directStream?verifiedX100viStream(document):null);
 async function detectInputs(){
  if(!navigator.mediaDevices?.enumerateDevices)throw Error('This browser does not support camera capture sources.');
  const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'&&d.deviceId);
  inputChoice.replaceChildren(new Option('Choose a device…',''));
  const requested=inputMode.value;
  for(const device of devices){
   const label=device.label||'Camera (grant access to identify)';
   if(requested==='usb-x100vi'&&!/\bX100VI\b/i.test(label))continue;
   if(requested==='external-hdmi'&&/\b(?:facetime|continuity|iphone|ipad|macbook|built.in)\b/i.test(label))continue;
   inputChoice.append(new Option(label,device.deviceId));
  }
  if(inputChoice.options.length===1)throw Error('No matching video input found. Check cable, camera USB WEBCAM mode or HDMI adapter, and browser camera permissions.');
  setStatus('Select the exact input below and click Connect. Source identity is checked from the actual video track.');
 }
 async function connectInput(){
  const mode=inputMode.value,id=inputChoice.value;
  if(mode==='existing-usb'){disconnectManualSource();setStatus('Using the existing verified X100VI USB stream, when available.');return}
  if(!id)throw Error('Detect inputs, then choose a specific camera device.');
  if(mode==='external-hdmi'&&!window.confirm('Use the manually selected external video input as a live monitor? FujiX Sync cannot confirm that this HDMI capture device is connected to the X100VI. Video frames are never labeled as full-resolution photographs.'))return;
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Browser camera access is unavailable.');
  disconnectManualSource();
  let stream;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:{exact:id}}});
   const track=stream.getVideoTracks()[0],actualId=track?.getSettings?.().deviceId||'';
   const label=track?.label||'';
   if(!actualId||actualId!==id||!label||
      /\b(?:facetime|continuity|iphone|ipad|macbook|built.in|obs virtual)\b/i.test(label)||
      (mode==='usb-x100vi'&&!/\bX100VI\b/i.test(label)))
     throw Error('Selected video track is not an eligible external capture source.');
   mirror.srcObject=stream;await mirror.play();
   if(!captureInputIsAllowed({mode,label,chosenId:id,actualId,trackState:track.readyState,
       videoWidth:mirror.videoWidth,videoHeight:mirror.videoHeight,readyState:mirror.readyState}))
     throw Error('Selected camera device did not deliver usable live video frames.');
   directStream=stream;directMode=mode;directDeviceId=id;directLabel=label;
   attachLive();
   setStatus(describeCaptureInput(mode,label));
  }catch(error){
   if(stream)for(const track of stream.getTracks())track.stop();
   mirror.pause();mirror.srcObject=null;directStream=null;directMode=null;
   throw error;
  }
 }
 const getSelected=()=>allPhotos.find(f=>f.id===selectedId)||null;
 const bytesLabel=n=>n>=1000000?(n/1000000).toFixed(1)+' MB':Math.round(n/1024)+' KB';
 const compatiblePreview=file=>file?.previewUrl&&/\.(jpe?g|png)$/i.test(file.name||file.savedName||'');
 function choosePhoto(id){
  selectedId=id;
  const photo=getSelected();
  if(!photo){
   selectedKind.textContent='Select a photo below';reviewMeta.textContent='No photo selected';
   preview.hidden=true;preview.removeAttribute('src');emptyReview.hidden=false;emptyReview.textContent='Choose a saved photo from the thumbnails.';
   pickButton.disabled=true;download.hidden=true;
  }else{
   selectedKind.textContent=reviewFileLabel(photo);
   reviewMeta.textContent=photo.name+' · '+bytesLabel(photo.bytes)+' · '+new Date(photo.createdAt).toLocaleString();
   if(compatiblePreview(photo)){
    preview.hidden=false;preview.src=photo.previewUrl;emptyReview.hidden=true;
   }else{
    preview.hidden=true;preview.removeAttribute('src');emptyReview.hidden=false;
    emptyReview.textContent=photo.isOriginal?'Camera original saved on Mac. Download or open it in your RAW photo editor.':'Preview cannot be displayed in this browser.';
   }
   pickButton.disabled=false;pickButton.textContent=picked.has(photo.id)?'Picked ★ — unpick':'Pick this photo ☆';
   download.hidden=false;download.href=photo.fileUrl;download.download=photo.name;
  }
  if(lastSelectedId!==selectedId){lastSelectedId=selectedId;markTiles()}else markTiles();
 }
 preview.addEventListener('error',()=>{
  preview.hidden=true;emptyReview.hidden=false;emptyReview.textContent='The browser cannot preview this file; download it to view in a photo editor.';
 });
 function markTiles(){
  photoGrid.querySelectorAll('button[data-photo-id]').forEach(b=>{
   b.dataset.selected=String(b.dataset.photoId===selectedId);
   b.dataset.picked=String(picked.has(b.dataset.photoId));
   b.setAttribute('aria-pressed',String(b.dataset.photoId===selectedId));
  });
 }
 function paintGallery(force=false){
  const filter=el('fxlp-filter').value;
  const files=visibleReviewPhotos(allPhotos,filter,picked);
  const signature=fileSignature(files)+'|'+filter+'|'+[...picked].sort().join(',');
  el('fxlp-count').textContent=allPhotos.length+' photos · '+picked.size+' picked';
  if(signature===lastPhotoSignature&&!force){markTiles();return}
  lastPhotoSignature=signature;
  photoGrid.replaceChildren();
  if(!files.length){
   const p=document.createElement('p');p.textContent='No photos in this view. Capture a live preview or import originals from the X100VI SD card.';p.style.cssText='font-size:12px;color:#93a6b7;line-height:1.5';photoGrid.append(p);
  }
  for(const photo of files){
   const tile=document.createElement('button');tile.type='button';tile.className='fxlp-tile';tile.dataset.photoId=photo.id;
   const art=document.createElement('span');art.className='fxlp-tile-image';
   if(compatiblePreview(photo)){const image=document.createElement('img');image.src=photo.previewUrl;image.alt=reviewFileLabel(photo);image.loading='lazy';art.append(image)}
   else art.textContent=photo.name?.split('.').at(-1)?.toUpperCase()||'PHOTO';
   const name=document.createElement('span');name.className='fxlp-tile-caption';name.textContent=photo.name;
   const kind=document.createElement('span');kind.className='fxlp-tile-kind';kind.textContent=photo.isOriginal?'ORIGINAL':'VIDEO PREVIEW';
   tile.append(art,name,kind);tile.addEventListener('click',()=>choosePhoto(photo.id));photoGrid.append(tile);
  }
  markTiles();
 }
 async function api(url,options){
  const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw Error(data.error||'Mac camera service failed');
  return data;
 }
 async function refreshLibrary({preferId=null}={}){
  const result=await api('/api/usb/photos',{cache:'no-store'});
  const originals=new Set(result.files.filter(p=>p.isOriginal).map(p=>p.id));
  const newOriginals=galleryReady?result.files.filter(p=>p.isOriginal&&!lastOriginalIds.has(p.id)):[];
  lastOriginalIds=originals;galleryReady=true;
  allPhotos=result.files||[];
  if(preferId&&allPhotos.some(p=>p.id===preferId))selectedId=preferId;
  else if(newOriginals.length){
   pendingShotUntil=0;
   selectedId=newOriginals[0].id;
   setStatus('New genuine camera original arrived on the Mac: '+newOriginals[0].name+'. Opened for review. Confirm it matches your shot.');
  }
  else if(!selectedId&&allPhotos.length)selectedId=allPhotos[0].id;
  else if(selectedId&&!allPhotos.some(p=>p.id===selectedId))selectedId=allPhotos[0]?.id||null;
  paintGallery();if(preferId||newOriginals.length||getSelected()?.id!==lastSelectedId)choosePhoto(selectedId);
  return result;
 }
 function attachLive(){
  const source=currentVideo();
  liveSource=source;
  frameButton.disabled=busy||!source;
  if(source){
   placeholder.hidden=true;pill.hidden=false;
   pill.textContent=directMode==='external-hdmi'?'EXTERNAL CAPTURE VIDEO · NOT RAW':'X100VI USB VIDEO · NOT RAW';
   el('fxlp-live-size').textContent=source.videoWidth+' × '+source.videoHeight+(directMode==='external-hdmi'?' HDMI input':' live UVC');
   if(mirror.srcObject!==source.srcObject){mirror.srcObject=source.srcObject;void mirror.play().catch(()=>{})}
  }else{
   placeholder.hidden=false;pill.hidden=true;
   el('fxlp-live-size').textContent='USB webcam unavailable';
   if(mirror.srcObject&&!directStream){mirror.pause();mirror.srcObject=null}
  }
 }
 async function captureFrame(){
  const source=currentVideo();
  if(!source)throw Error('No verified live capture video. Connect the X100VI USB WEBCAM or explicitly selected HDMI capture device first.');
  const canvas=document.createElement('canvas');canvas.width=source.videoWidth;canvas.height=source.videoHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cannot access live capture video pixels');
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
  if(!blob||blob.size<128)throw Error('Camera video frame is incomplete');
  const result=await api('/api/usb/photos/capture',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
  if(result.photo?.isOriginal!==false||!result.photo?.id)throw Error('The Mac did not confirm a saved video preview');
  await refreshLibrary({preferId:result.photo.id});
  return result.photo;
 }
 async function waitNextVideoFrame(video){
  if(typeof video.requestVideoFrameCallback!=='function'){await new Promise(done=>setTimeout(done,250));return false}
  return new Promise(resolve=>{
   let done=false;
   const id=video.requestVideoFrameCallback(()=>{if(done)return;done=true;clearTimeout(timeout);resolve(true)});
   const timeout=setTimeout(()=>{if(done)return;done=true;video.cancelVideoFrameCallback?.(id);resolve(false)},1800);
  });
 }
 async function captureOnly(){
  if(busy)return;setBusy(true);
  try{setStatus('Saving the current verified capture-video frame to Mac…');const saved=await captureFrame();setStatus('Saved VIDEO PREVIEW '+saved.name+' to Mac. No photographic shutter was fired; this is not a camera RAW/JPEG still.')}
  catch(error){setStatus(error.message,true)}finally{setBusy(false)}
 }
 async function shootAndReview(){
  if(busy)return;setBusy(true);pendingShotUntil=0;
  setStatus('Authenticating Bluetooth and sending one physical X100VI shutter command…');
  try{
   const initial=await api('/api/direct/ble/shoot',{method:'POST'});
   let result=initial;
   for(let i=0;i<65&&result.running;i++){
    await new Promise(done=>setTimeout(done,650));
    result=await api('/api/direct/ble/shoot/status',{cache:'no-store'});
    setStatus(result.detail||'Waiting for physical camera shutter acknowledgment…');
   }
   if(result.running||!result.commandAccepted)throw Error(result.detail||'The X100VI did not acknowledge its shutter command.');
   pendingShotUntil=Date.now()+120000;
   const source=currentVideo();
   if(source){
    setStatus('Camera shutter command acknowledged. Waiting for a fresh X100VI USB video frame…');
    const frameArrived=await waitNextVideoFrame(source);
    if(frameArrived){
     try{
      const saved=await captureFrame();
      setStatus('Camera shutter command acknowledged. Saved and selected a VIDEO PREVIEW ('+saved.name+'). This is not the camera still; waiting for a transferred camera original.');
     }catch(error){setStatus('Shutter command acknowledged, but preview save failed: '+error.message,true)}
    }else setStatus('Shutter command acknowledged but the USB webcam did not deliver a fresh frame. No substitute preview created; waiting for a transferred camera original.');
   }else setStatus('X100VI acknowledged a physical shutter command. USB video is not connected, so no instant picture is available. Check the SD image, then transfer the original to review it here.');
   await refreshLibrary();
  }catch(error){setStatus('Camera shutter not confirmed: '+error.message,true)}
  finally{setBusy(false)}
 }
 async function importFiles(files){
  if(!files.length||busy)return;
  setBusy(true);let successes=0;
  try{
   for(const file of files){
    if(!/\.(raf|jpe?g|png|heic|heif|tiff?)$/i.test(file.name)||file.size<128||file.size>200*1024*1024){setStatus('Skipped unsupported or oversized camera file '+file.name,true);continue}
    try{
     const result=await api('/api/usb/photos/import?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
     successes++;
     await refreshLibrary({preferId:result.photo.id});
    }catch(error){setStatus('Failed to import '+file.name+': '+error.message,true)}
   }
   if(successes)setStatus('Imported '+successes+' genuine camera file(s). Select any thumbnail and press Pick this photo to mark your favorite.');
  }finally{setBusy(false)}
 }
 const open=async()=>{
  root.hidden=false;active=true;
  attachLive();
  try{await refreshLibrary()}catch(error){setStatus('Could not read the Mac photo gallery: '+error.message,true)}
  if(!liveSource)setStatus('X100VI USB live video is not currently available. You can still view and pick existing Mac photos or use the separate Bluetooth shutter.');
 };
 const close=()=>{
  active=false;root.hidden=true;mirror.pause();mirror.srcObject=null;liveSource=null;
  if(directStream)disconnectManualSource();
 };
 inputMode.addEventListener('change',()=>{disconnectManualSource();inputChoice.replaceChildren(new Option('Detect video inputs…',''));});
 el('fxlp-detect-inputs').addEventListener('click',()=>void detectInputs().catch(error=>setStatus(error.message,true)));
 el('fxlp-connect-input').addEventListener('click',()=>void connectInput().catch(error=>setStatus(error.message,true)));
 el('fxlp-disconnect-input').addEventListener('click',()=>{disconnectManualSource();setStatus('External capture disconnected. Any existing FujiX Sync USB stream remains available.')});
 async function refreshDelivery(){
  try{
   const value=await api('/api/usb/originals/watch/status',{cache:'no-store'});
   deliveryState.textContent=(value.active?'Watching delivered originals':'Folder watching off')+
    ' · '+(value.source||'no source selected')+' · '+value.imported+' imported'+
    (value.lastError?' · '+value.lastError:'');
   el('fxlp-watch-start').disabled=value.active||value.starting;
   el('fxlp-watch-stop').disabled=!value.active;
  }catch(error){deliveryState.textContent='Cannot read original delivery watcher: '+error.message}
 }
 el('fxlp-source-folder').addEventListener('click',async()=>{
  try{
   const state=await api('/api/tether/status',{cache:'no-store'});
   const folder=window.prompt('Enter the existing local Mac folder where Frame.io Drive or another transfer app delivers actual RAF/JPEG originals. FujiX Sync will only read new files appearing after you start monitoring.',state.folder||'');
   if(folder===null)return;
   if(!folder.trim())throw Error('Choose an existing local Mac folder.');
   await api('/api/tether/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:folder.trim()})});
   await refreshDelivery();
  }catch(error){deliveryState.textContent=error.message}
 });
 el('fxlp-watch-start').addEventListener('click',async()=>{
  try{await api('/api/usb/originals/watch/start',{method:'POST'});await refreshDelivery()}
  catch(error){deliveryState.textContent=error.message}
 });
 el('fxlp-watch-stop').addEventListener('click',async()=>{
  try{await api('/api/usb/originals/watch/stop',{method:'POST'});await refreshDelivery()}
  catch(error){deliveryState.textContent=error.message}
 });
 launch.addEventListener('click',()=>void open());
 el('fxlp-close').addEventListener('click',close);
 root.addEventListener('click',e=>{if(e.target===root)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});
 el('fxlp-reload').addEventListener('click',()=>void refreshLibrary().catch(e=>setStatus(e.message,true)));
 el('fxlp-filter').addEventListener('change',()=>paintGallery(true));
 pickButton.addEventListener('click',()=>{
  const photo=getSelected();if(!photo)return;
  if(picked.has(photo.id))picked.delete(photo.id);else picked.add(photo.id);
  savePicks();choosePhoto(photo.id);paintGallery(true);
  setStatus(picked.has(photo.id)?'Picked '+photo.name+'. Your picks remain saved in this Mac browser.':'Unpicked '+photo.name+'. No camera files were deleted.');
 });
 frameButton.addEventListener('click',()=>void captureOnly());
 shutterButton.addEventListener('click',()=>void shootAndReview());
 el('fxlp-import').addEventListener('click',()=>fileInput.click());
 fileInput.addEventListener('change',()=>{const files=[...fileInput.files];fileInput.value='';void importFiles(files)});
 function attachLauncher(){
  const library=Boolean(document.getElementById('fujix-mac-controls-inline-target'));
  launch.hidden=!library;
  const dock=document.getElementById('fujix-mac-photo-floating');
  if(dock&&!dock.contains(launch))dock.append(launch);
  else if(!dock&&!launch.isConnected)document.body.append(launch);
  if(!library&&active)close();
  if(active)attachLive();
 }
 let pollBusy=false;
 const tick=async()=>{
  attachLauncher();
  if(!active||pollBusy)return;
  pollBusy=true;
  try{await refreshLibrary();await refreshDelivery();if(pendingShotUntil&&Date.now()>pendingShotUntil){pendingShotUntil=0;setStatus('No actual new camera original was received in two minutes. A displayed video JPEG is only a preview.')}}catch{}
  finally{pollBusy=false}
 };
 setInterval(attachLauncher,900);setInterval(()=>void tick(),2400);
 attachLauncher();
}
