/** FujiX Sync native Mac photo gallery. Only reads authenticated real X100VI
 * UVC stream already opened by the original Library React component.
 * No simulated frames, no background shutter, no camera SD writes.
 */
const photoPath='/api/usb/photos';
if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){
 const css=document.createElement('style');css.textContent=`
 #fujix-mac-photo-actions{display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap}
 #fujix-mac-photo-actions button{border:1px solid #28536b;border-radius:7px;background:#092b42;color:#9eddf6;font-size:10px;font-weight:650;padding:8px 10px;cursor:pointer}
 #fujix-mac-photo-actions button:disabled{color:#898b8c;background:#25282a;border-color:#34383c;cursor:not-allowed}
 #fujix-mac-photo-floating{position:relative;display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:10px;background:#111113;border:1px solid #242428;border-radius:12px;box-shadow:none}
 #fujix-mac-photo-floating[hidden]{display:none}
 #fujix-mac-photo-floating button{border:1px solid #2a789f;background:#132b3b;color:#b6e9ff;border-radius:8px;padding:10px 13px;font:700 12px system-ui;cursor:pointer}
 #fujix-mac-photo-floating button.main{background:#0ba5e9;color:#061420}
 #fujix-mac-photo-floating button:disabled{background:#282c30;color:#95989b;border-color:#444851;cursor:not-allowed}
 #fujix-mac-photo-drawer{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:20px}
 #fujix-mac-photo-drawer[hidden]{display:none}
 #fujix-mac-photo-card{width:min(1050px,95vw);max-height:91vh;overflow:auto;background:#111315;color:#e6e9ec;border:1px solid #353b41;border-radius:17px;box-shadow:0 25px 90px #000}
 #fujix-mac-photo-card header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:19px 20px;border-bottom:1px solid #30333a}
 #fujix-mac-photo-card header h2{font-size:19px;font-weight:750;margin:0}
 #fujix-mac-photo-card header p{margin:4px 0 0;color:#a0a6ae;font-size:11px}
 #fujix-mac-photo-card button{cursor:pointer}
 #fujix-mac-photo-controls{display:flex;gap:8px;flex-wrap:wrap;padding:13px 20px;border-bottom:1px solid #30333a}
 #fujix-mac-photo-controls button,#fujix-mac-photo-close{background:#25282e;color:#e4eaf1;border:1px solid #4b5664;border-radius:8px;font-size:12px;padding:9px 12px}
 #fujix-mac-photo-controls button.primary{background:#1499da;border-color:#1499da;color:#06111b;font-weight:700}
 #fujix-mac-photo-controls button:disabled{opacity:.4;cursor:not-allowed}
 #fujix-mac-photo-message{padding:8px 20px;color:#b5b7ba;font-size:12px;min-height:27px}
 #fujix-mac-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:13px;padding:17px 20px 25px}
 .fujix-photo-tile{min-width:0;border:1px solid #333b42;border-radius:11px;overflow:hidden;background:#17191c}
 .fujix-photo-thumb{display:grid;place-items:center;width:100%;aspect-ratio:4/3;overflow:hidden;background:#20252a;color:#85919c;font-size:24px}
 .fujix-photo-thumb img{height:100%;width:100%;object-fit:cover}
 .fujix-photo-tile .metadata{padding:9px 10px;color:#ccd2d8;font-size:10px}
 .fujix-photo-tile .metadata b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .fujix-photo-tile .metadata small{display:block;color:#9aa1ad;font-size:10px;margin-top:4px}
 .fujix-photo-tile .metadata a{display:inline-block;margin-top:7px;color:#5dc3ff;text-decoration:underline}
 #fujix-mac-photo-note{padding:0 20px 19px;font-size:11px;line-height:1.6;color:#969ba5}
 #fujix-real-tether-controls{padding:12px 20px;border-bottom:1px solid #34363a;background:#12171d}
 #fujix-real-tether-controls h3{color:#e2e9f1;font-size:13px;font-weight:750;margin:0 0 7px}
 #fujix-real-tether-controls p{font-size:11px;color:#a6b2bf;margin:6px 0;line-height:1.5}
 #fujix-real-tether-controls .actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
 #fujix-real-tether-controls button{background:#203d54;border:1px solid #496d85;border-radius:8px;color:#d7f2ff;font-size:11px;padding:9px 12px}
 @media(max-width:620px){#fujix-mac-photo-card header{padding:13px}#fujix-mac-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}}`;
 document.head.append(css);
 const drawer=document.createElement('section');drawer.id='fujix-mac-photo-drawer';drawer.hidden=true;drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','FujiX Sync photos saved on Mac');
 drawer.innerHTML=`<div id="fujix-mac-photo-card"><header><div><h2>Photos on Your Mac</h2><p>Actual files in Pictures/FujiX Sync • previews and camera originals are kept separate</p></div><button type="button" id="fujix-mac-photo-close">Close</button></header><div id="fujix-mac-photo-controls"><button type="button" class="primary" id="fujix-mac-photo-capture">Capture USB preview</button><button type="button" id="fujix-mac-photo-import">Import RAF/JPEG originals</button><button type="button" id="fujix-mac-photo-open">Open folder in Finder</button><button type="button" id="fujix-mac-photo-refresh">Refresh</button></div><div id="fujix-real-tether-controls"><h3>Real Camera Shutter + Original Transfer</h3><p><strong>Shutter:</strong> Bluetooth can send a real photographic shutter command. A completed command is not proof that the camera saved a photo.</p><div class="actions"><button id="fujix-native-shutter" type="button">Shoot X100VI (Mac Bluetooth)</button><button id="fujix-real-shutter" type="button">Browser Bluetooth shutter</button><button id="fujix-watch-start" type="button">Start watching delivered originals</button><button id="fujix-watch-stop" type="button">Stop watching</button><button id="fujix-watch-source" type="button">Choose source folder</button></div><p id="fujix-native-shutter-status" role="status" aria-live="polite">Mac Bluetooth shutter ready to test; secure authentication is checked for every shot.</p><p id="fujix-watch-status" role="status">Originals transfer monitoring is off.</p><p>Original photos must arrive in your selected Mac folder via a supported transfer, card reader or delivery app. In USB WEBCAM mode the X100VI does not expose simultaneous native 40MP RAF transfer.</p></div><p id="fujix-mac-photo-message" role="status" aria-live="polite">Loading photos saved on your Mac…</p><div id="fujix-mac-photo-grid"></div><div id="fujix-mac-photo-note">A USB webcam capture is a video-frame JPEG (up to the webcam resolution), not a full-resolution shutter photograph. To import real 40MP RAF/JPEG originals, capture them on the camera and transfer them from its SD card, for example using USB CARD READER mode or an SD card reader. Switching modes temporarily stops USB live view.</div></div>`;
 // Camera-to-Mac originals use Fujifilm's Wi-Fi gallery protocol, not Apple
 // AirDrop or Bluetooth file transfer. Keep activation an explicit user action.
 drawer.querySelector('#fujix-real-tether-controls').insertAdjacentHTML('beforeend',`
  <section id="fujix-wireless-originals" style="margin-top:12px;padding:11px;border:1px solid #375165;border-radius:9px">
    <h3>AirDrop-style wireless originals (experimental)</h3>
    <p>X100VI Bluetooth controls the shutter; Fujifilm Wi-Fi downloads actual JPEG/RAF files. This is not Apple AirDrop. Camera Wi-Fi gallery and native Wi-Fi live view cannot run simultaneously.</p>
    <div class="actions"><button type="button" id="fujix-wireless-originals-start" disabled>Enable automatic wireless originals</button><button type="button" id="fujix-wireless-originals-stop" disabled>Stop wireless transfer</button><button type="button" id="fujix-wireless-originals-setup">Check simultaneous Wi-Fi readiness</button></div>
    <p id="fujix-wireless-originals-status" role="status" aria-live="polite">Checking direct camera Wi-Fi and transfer readiness…</p>
  </section>`);
 drawer.querySelector('#fujix-real-tether-controls').insertAdjacentHTML('beforeend',`
  <section id="fujix-local-cloud" style="margin-top:12px;padding:11px;border:1px solid #375165;border-radius:9px">
   <h3>FujiX Sync Local Cloud — Home Wi-Fi</h3>
   <p>Receive real RAF/JPEG originals from another device on your trusted home Wi-Fi, directly into Mac Photos. This does not redirect the X100VI Frame.io uploader, and the camera has not been proven to send directly to this server.</p>
   <div class="actions"><button type="button" id="fujix-local-cloud-start">Start private LAN receiver</button><button type="button" id="fujix-local-cloud-stop" disabled>Stop LAN receiver</button></div>
   <p id="fujix-local-cloud-status" role="status" aria-live="polite">Local Cloud is off. Your existing main Wi-Fi will not change.</p>
   <div id="fujix-local-cloud-pairing" hidden>
    <p>On your phone connected to the same home Wi-Fi, visit <strong id="fujix-local-cloud-url"></strong> and enter this one-session pairing key:</p>
    <input id="fujix-local-cloud-key" type="password" readonly aria-label="Local Cloud pairing key" style="min-width:0;width:min(340px,90%);background:#152536;color:#fff;border:1px solid #587995;border-radius:7px;padding:9px;box-sizing:border-box">
    <button id="fujix-local-cloud-copy" type="button">Copy pairing key</button>
    <p>The receiver stays on your Mac's private LAN only. Local HTTP does not provide end-to-end transport encryption; use only a network you trust. The receiver is disabled when FujiX Sync stops.</p>
   </div>
  </section>`);
 document.body.append(drawer);
 const floating=document.createElement('div');floating.id='fujix-mac-photo-floating';floating.hidden=true;floating.setAttribute('role','group');floating.setAttribute('aria-label','X100VI photo controls');
 const floatingCapture=document.createElement('button');floatingCapture.id='fujix-mac-floating-capture';floatingCapture.type='button';floatingCapture.className='main';floatingCapture.textContent='Capture Photo to Mac';floatingCapture.title='Capture actual X100VI USB video frame as Finder JPEG; does not use the camera mechanical shutter.';
 const floatingPhotos=document.createElement('button');floatingPhotos.id='fujix-mac-floating-photos';floatingPhotos.type='button';floatingPhotos.textContent='Mac Photos';
 const floatingShutter=document.createElement('button');floatingShutter.id='fujix-mac-floating-shutter';floatingShutter.type='button';floatingShutter.textContent='Shoot X100VI';floatingShutter.title='Send one native Mac Bluetooth shutter press to the camera; RAW/JPEG transfer is separate.';
 floating.append(floatingCapture,floatingShutter,floatingPhotos);document.body.append(floating);
 const input=document.createElement('input');input.type='file';input.accept='.raf,.jpg,.jpeg,.png,.heif,.heic,.tif,.tiff';input.multiple=true;input.hidden=true;document.body.append(input);
 const gallery=drawer.querySelector('#fujix-mac-photo-grid');const message=drawer.querySelector('#fujix-mac-photo-message');const captureDrawer=drawer.querySelector('#fujix-mac-photo-capture');
 const watchStatus=drawer.querySelector('#fujix-watch-status');
 const nativeStatus=drawer.querySelector('#fujix-native-shutter-status');
 const nativeButton=drawer.querySelector('#fujix-native-shutter');
 const wirelessStart=drawer.querySelector('#fujix-wireless-originals-start');
 const wirelessStop=drawer.querySelector('#fujix-wireless-originals-stop');
 const wirelessStatus=drawer.querySelector('#fujix-wireless-originals-status');
 const cloudStart=drawer.querySelector('#fujix-local-cloud-start');
 const cloudStop=drawer.querySelector('#fujix-local-cloud-stop');
 const cloudStatus=drawer.querySelector('#fujix-local-cloud-status');
 const cloudPairing=drawer.querySelector('#fujix-local-cloud-pairing');
 const cloudKey=drawer.querySelector('#fujix-local-cloud-key');
 let cloudBusy=false;
 async function refreshLocalCloud(){
  if(cloudBusy)return;
  try{
   const response=await fetch('/api/local-cloud/status',{cache:'no-store'});
   if(!response.ok)throw Error('Local Cloud service unavailable');
   const data=await response.json();
   cloudStart.disabled=Boolean(data.active);cloudStop.disabled=!data.active;
   cloudStatus.textContent=data.active
    ? `Receiver active on ${data.url}. ${data.received} complete original file(s) received (${(data.bytes/1048576).toFixed(1)} MB). Home Wi-Fi is not switched.`
    : 'Local Cloud receiver is off. Your main Wi-Fi stays connected.';
   if(!data.active){cloudKey.value='';cloudPairing.hidden=true}
  }catch(e){cloudStart.disabled=true;cloudStop.disabled=true;cloudStatus.textContent=e.message}
 }
 async function cloudCommand(action){
  if(cloudBusy)return;
  cloudBusy=true;cloudStart.disabled=true;cloudStop.disabled=true;
  cloudStatus.textContent=action==='start'?'Starting local-only receiver on your existing home Wi-Fi…':'Stopping and rotating the local-cloud pairing key…';
  try{
   const response=await fetch('/api/local-cloud/'+action,{method:'POST'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Local Cloud operation failed');
   if(action==='start'){
    cloudPairing.hidden=false;
    cloudKey.value=data.pairingKey;
    drawer.querySelector('#fujix-local-cloud-url').textContent=data.url;
   }else{cloudKey.value='';cloudPairing.hidden=true}
  }catch(e){cloudStatus.textContent=e.message||'Local Cloud could not start'}
  finally{cloudBusy=false;await refreshLocalCloud()}
 }
 cloudStart.addEventListener('click',()=>void cloudCommand('start'));
 cloudStop.addEventListener('click',()=>void cloudCommand('stop'));
 drawer.querySelector('#fujix-local-cloud-copy').addEventListener('click',()=>{
  if(!cloudKey.value)return;
  navigator.clipboard.writeText(cloudKey.value).then(()=>{cloudStatus.textContent='Pairing key copied for your own device. Do not share it publicly.'}).catch(()=>{cloudStatus.textContent='Select and copy the pairing key manually.'});
 });
 let wirelessBusy=false;
 async function refreshWirelessOriginals(){
  if(wirelessBusy)return;
  try{
   const [transferRes,networkRes,dualRes]=await Promise.all([
    fetch('/api/direct/auto-transfer/status',{cache:'no-store'}),
    fetch('/api/direct/check',{cache:'no-store'}),
    fetch('/api/direct/dual-network/status',{cache:'no-store'})]);
   if(!transferRes.ok||!networkRes.ok||!dualRes.ok)throw Error('Local camera transfer or dual-network status is unavailable.');
   const [transfer,network,dual]=await Promise.all([transferRes.json(),networkRes.json(),dualRes.json()]);
   // This panel is deliberately main-Wi-Fi-preserving. Legacy camera-only
   // direct Wi-Fi remains in the separate Camera Wi-Fi Setup flow.
   const preserved=dual.mainWifiIsDefault===true&&dual.cameraOnSeparateInterface===true;
   const ready=preserved&&network.network?.inCameraSubnet===true&&network.network?.ptpReachable===true;
   wirelessStart.disabled=transfer.active||!ready;
   wirelessStop.disabled=!transfer.active;
   const networkMessage=!dual.secondWifiRadioDetected
    ? 'Only one physical Wi-Fi adapter is present. Connecting it to the X100VI hotspot would replace the main Wi-Fi connection. Main Wi-Fi has not been changed. A second compatible Wi-Fi adapter is needed to keep both SSIDs connected.'
    : !preserved
     ? 'A second Wi-Fi adapter is detected, but the Mac has not established a separate camera path while retaining the main Wi-Fi default route. Do not switch en0 away from the main Wi-Fi.'
     : 'Main Wi-Fi default route remains intact and a separate camera subnet is present. Camera protocol handshake still required.';
   wirelessStatus.textContent=transfer.active
    ? `Monitoring X100VI Wi-Fi gallery. ${transfer.imported} original file(s) downloaded to the Mac. ${transfer.error||'Waiting for a new camera file; no photo is assumed until the original arrives.'} ${networkMessage}`
    : `${transfer.error?transfer.error+' ':''}${ready?'X100VI camera PTP/IP service reachable. Enable monitoring before the next shot.':networkMessage}`;
  }catch(e){wirelessStart.disabled=true;wirelessStop.disabled=true;wirelessStatus.textContent=e.message||'Wireless original transfer status unavailable.'}
 }
 async function wirelessCommand(action){
  if(wirelessBusy)return;
  wirelessBusy=true;wirelessStart.disabled=true;wirelessStop.disabled=true;
  wirelessStatus.textContent=action==='start'?'Checking camera gallery and recording existing SD photos without importing them…':'Stopping wireless photo monitoring…';
  try{
   const response=await fetch('/api/direct/auto-transfer/'+action,{method:'POST'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'X100VI wireless gallery operation failed.');
   wirelessStatus.textContent=action==='start'?'Watching new X100VI photos; download starts only after a new original is verified.':'Wireless auto-transfer stopped.';
  }catch(e){wirelessStatus.textContent=e.message||'Camera Wi-Fi transfer could not be started.'}
  finally{wirelessBusy=false;await refreshWirelessOriginals()}
 }
 wirelessStart.addEventListener('click',()=>void wirelessCommand('start'));
 wirelessStop.addEventListener('click',()=>void wirelessCommand('stop'));
 drawer.querySelector('#fujix-wireless-originals-setup').addEventListener('click',()=>void refreshWirelessOriginals());
 async function shootFromMac(){
  if(nativeButton.disabled)return;
  nativeButton.disabled=true;floatingShutter.disabled=true;
  nativeStatus.textContent='Connecting to X100VI and authenticating Mac Bluetooth…';
  try{
   const response=await fetch('/api/direct/ble/shoot',{method:'POST'});
   const started=await response.json();
   if(!response.ok)throw Error(started.error||'Native camera shutter could not start');
   let result=started;
   for(let i=0;i<65&&result.running;i++){
    await new Promise(resolve=>setTimeout(resolve,700));
    const statusResponse=await fetch('/api/direct/ble/shoot/status',{cache:'no-store'});
    if(!statusResponse.ok)throw Error('Cannot read X100VI shutter status');
    result=await statusResponse.json();
    nativeStatus.textContent=result.detail||'Waiting for X100VI Bluetooth response…';
   }
   if(result.running)throw Error('Camera shutter status timed out');
   if(!result.commandAccepted)throw Error(result.detail||'The camera did not acknowledge the shutter command');
   nativeStatus.textContent='X100VI acknowledged the photographic shutter command. Check camera SD for the exposure. Waiting for a real original file; no RAF transfer is claimed.';
   await refresh();
  }catch(error){nativeStatus.textContent='X100VI shutter not verified: '+error.message}
  finally{nativeButton.disabled=false;floatingShutter.disabled=false}
 }
 function launchShootPick(){
  const launcher=document.getElementById('fujix-live-pick-launch');
  const shoot=document.getElementById('fxlp-shoot');
  if(!launcher||!shoot||launcher.hidden)return false;
  drawer.hidden=true;
  launcher.click();
  shoot.click();
  return true;
 }
 nativeButton.addEventListener('click',()=>{if(!launchShootPick())void shootFromMac()});
 floatingShutter.addEventListener('click',()=>{if(!launchShootPick()){drawer.hidden=false;void shootFromMac()}});
 let lastImportCount=-1;
 async function pollOriginals(){
  try{
   const res=await fetch('/api/usb/originals/watch/status',{cache:'no-store'});
   if(!res.ok)throw Error('Mac original-photo watcher unavailable');
   const value=await res.json();
   const suffix=value.lastCopied?` · last file: ${value.lastCopied.name}`:'';
   watchStatus.textContent=`${value.active?'Watching':'Not watching'} · source: ${value.source||'not selected'} · imported ${value.imported} genuine file(s)${suffix}${value.lastError?' · '+value.lastError:''}`;
   if(!drawer.hidden&&lastImportCount!==-1&&lastImportCount!==value.imported)void refresh();
   lastImportCount=value.imported;
  }catch(error){watchStatus.textContent=error.message}
 }
 async function watchCommand(action){
  try{
   const res=await fetch('/api/usb/originals/watch/'+action,{method:'POST'});
   const value=await res.json();if(!res.ok)throw Error(value.error||'Cannot change original import monitoring');
   await pollOriginals();
  }catch(error){watchStatus.textContent=error.message}
 }
 drawer.querySelector('#fujix-watch-start').addEventListener('click',()=>void watchCommand('start'));
 drawer.querySelector('#fujix-watch-stop').addEventListener('click',()=>void watchCommand('stop'));
 drawer.querySelector('#fujix-watch-source').addEventListener('click',async()=>{
  const current=await (await fetch('/api/tether/status',{cache:'no-store'})).json().catch(()=>({}));
  const source=prompt('Enter the existing Mac folder where Frame.io, a card reader or another transfer deposits original RAF/JPEG files.',current.folder||'');
  if(source===null)return;
  if(!source.trim()){watchStatus.textContent='Choose an existing Mac folder.';return}
  try{
   const res=await fetch('/api/tether/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:source.trim()})});
   const result=await res.json();if(!res.ok)throw Error(result.error||'Cannot select source folder');
   await pollOriginals();
  }catch(error){watchStatus.textContent=error.message}
 });
 drawer.querySelector('#fujix-real-shutter').addEventListener('click',()=>{
  const release=document.getElementById('fujix-shutter-release');
  if(!release||release.disabled){
   watchStatus.textContent='No authenticated real shutter is connected. Use the X100VI Bluetooth pairing control in the Library Shutter panel, or press the shutter on the camera. USB Webcam alone cannot trigger a full-resolution exposure.';
   drawer.hidden=true;
   document.getElementById('fujix-ble-connect')?.scrollIntoView({behavior:'smooth',block:'center'});
   return;
  }
  // Reuse the existing Shoot & Review controller so that a single real
  // shutter click arms its pending-shot correlation and saves a distinct USB
  // reference preview; never synthesize a shutter success from webcam data.
  const controller=document.getElementById('fujix-capture-shoot');
  if(controller&&!controller.disabled)controller.click();else release.click();
  watchStatus.textContent='Real shutter release requested through FujiX Sync Shoot & Review. Confirm exposure on camera. A full-resolution original is confirmed only after its file reaches this Mac.';
 });
 const close=()=>{drawer.hidden=true};
 drawer.querySelector('#fujix-mac-photo-close').addEventListener('click',close);
 drawer.addEventListener('click',event=>{if(event.target===drawer)close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!drawer.hidden)close()});
 const notify=(text,kind='info')=>{message.textContent=text;message.style.color=kind==='error'?'#fca5a5':'#b5b7ba'};
 const fmtBytes=n=>n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1024)} KB`;
 const getVideo=()=>document.querySelector('video[data-testid="fujix-live-video"]');
 function getActiveUSB(){
  const video=getVideo();const track=video?.srcObject?.getVideoTracks?.()[0];const settings=track?.getSettings?.()||{};
  const label=track?.label||'';
  const direct=document.getElementById('fujix-live-mode-direct');
  const selected=document.getElementById('fujix-video-source');
  const selectedOption=selected?.selectedOptions?.[0];
  if(direct?.getAttribute('aria-pressed')!=='true'||track?.readyState!=='live'||!/\b(?:FUJIFILM\s+)?X100VI\b/i.test(label)||video.videoWidth<1||video.videoHeight<1)return null;
  // Chrome can expose the real, verified X100VI track before the React select
  // is populated with a usable deviceId (e.g., just after permission). Only
  // reject an actual mismatch when both IDs are present.
  if(settings.deviceId && selected?.value && settings.deviceId!==selected.value)return null;
  return video;
 }
 async function refresh(){
  try{
   const response=await fetch(photoPath,{cache:'no-store'});
   const list=await response.json();if(!response.ok)throw Error(list.error||'Cannot open Mac photo library');
   gallery.replaceChildren();
   for(const item of list.files){
    const tile=document.createElement('article');tile.className='fujix-photo-tile';
    const thumb=document.createElement('div');thumb.className='fujix-photo-thumb';
    if(item.previewUrl){const picture=document.createElement('img');picture.src=item.previewUrl;picture.alt=item.kind==='usb-preview'?'USB video JPEG preview':'Imported original photo';picture.loading='lazy';picture.onerror=()=>{picture.remove();thumb.textContent='PHOTO'};thumb.append(picture)}else thumb.textContent=(item.name.split('.').at(-1)||'RAW').toUpperCase();
    const meta=document.createElement('div');meta.className='metadata';
    const name=document.createElement('b');name.textContent=item.name;name.title=item.name;meta.append(name);
    const kind=document.createElement('small');kind.textContent=`${item.isOriginal?'Camera original':'USB video preview'} · ${fmtBytes(item.bytes)} · ${new Date(item.createdAt).toLocaleString()}`;meta.append(kind);
    const download=document.createElement('a');download.href=item.fileUrl;download.textContent='Download';download.setAttribute('download',item.name);meta.append(download);
    tile.append(thumb,meta);gallery.append(tile);
   }
   notify(`${list.count} Mac photo${list.count===1?'':'s'} saved in ${list.folder}. Preview JPEGs and originals have separate folders.`);
  }catch(error){notify(error.message||'Photo library cannot be accessed','error')}
 }
 async function capture(){
  const active=getActiveUSB();if(!active){notify('Start the real FUJIFILM X100VI USB live view first. Mac/phone webcams are not accepted.','error');return}
  const sendButtons=[captureDrawer,floatingCapture,document.querySelector('#fujix-usb-capture')];sendButtons.forEach(b=>{if(b)b.disabled=true});
  try{
   const canvas=document.createElement('canvas');canvas.width=active.videoWidth;canvas.height=active.videoHeight;
   const context=canvas.getContext('2d');if(!context)throw Error('USB photo encoder is unavailable');
   context.drawImage(active,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
   if(!blob||blob.size<128)throw Error('No valid X100VI frame received');
   const response=await fetch(photoPath+'/capture',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Cannot save JPEG to the Mac');
   drawer.hidden=false;await refresh();notify(`Saved X100VI USB preview — ${canvas.width} × ${canvas.height} JPEG in your Mac Pictures folder. This is not a full-resolution shutter photo.`);
  }catch(error){notify(error.message||'USB capture failed','error');drawer.hidden=false}
  finally{sendButtons.forEach(b=>{if(b)b.disabled=false})}
 }
 async function importFiles(files){
  if(!files?.length)return;
  drawer.hidden=false;
  const allowed=/\.(raf|jpg|jpeg|png|heic|heif|tif|tiff)$/i;
  let imported=0;
  for(const f of files){
   if(!allowed.test(f.name)||f.size<128||f.size>200*1024*1024){notify(`Skipped unsupported or oversized original ${f.name}`,'error');continue}
   try{
    notify(`Importing ${imported+1} of ${files.length}: ${f.name}…`);
    const response=await fetch(photoPath+'/import?name='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f});
    const saved=await response.json();if(!response.ok)throw Error(saved.error||'Import failed');imported++;
   }catch(error){notify(`Unable to import ${f.name}: ${error.message}`,'error')}
  }
  await refresh();notify(`Imported ${imported} genuine original file${imported===1?'':'s'} to your Mac. USB webcam video remained untouched.`);
 }
 input.addEventListener('change',()=>{const files=[...input.files];input.value='';void importFiles(files)});
 drawer.querySelector('#fujix-mac-photo-import').addEventListener('click',()=>input.click());
 drawer.querySelector('#fujix-mac-photo-open').addEventListener('click',async()=>{
  try{const response=await fetch(photoPath+'/reveal',{method:'POST'});const result=await response.json();if(!response.ok)throw Error(result.error||'Finder could not open');notify(`Opened ${result.folder} in Finder.`)}catch(error){notify(error.message,'error')}
 });
 drawer.querySelector('#fujix-mac-photo-refresh').addEventListener('click',()=>void refresh());
 captureDrawer.addEventListener('click',()=>void capture());
 floatingCapture.addEventListener('click',()=>void capture());
 floatingPhotos.addEventListener('click',()=>{drawer.hidden=false;void refresh()});
 function attach(){
  // Actions belong inside Library, never in a floating dock. In particular,
  // clicking the React Library tab does not have to change the URL query.
  const target=document.getElementById('fujix-mac-controls-inline-target');
  if(target&&floating.parentElement!==target)target.append(floating);
  floating.hidden=!target;
  const bar=document.querySelector('#fujix-usb-bridge-assistant');if(!bar)return;
  if(!bar.querySelector('#fujix-mac-photo-actions')){
   const actions=document.createElement('div');actions.id='fujix-mac-photo-actions';
   const shutter=document.createElement('button');shutter.id='fujix-usb-capture';shutter.type='button';shutter.textContent='Capture to Mac';shutter.title='Save one JPEG frame from the real X100VI USB video into Finder; does not fire the camera shutter.';shutter.addEventListener('click',()=>void capture());
   const photos=document.createElement('button');photos.id='fujix-mac-photos';photos.type='button';photos.textContent='Mac Photos';photos.addEventListener('click',()=>{drawer.hidden=false;void refresh()});
   actions.append(shutter,photos);bar.append(actions);
   bar.style.flexWrap='wrap';bar.style.maxWidth='min(520px,90vw)';
  }
  const shutter=bar.querySelector('#fujix-usb-capture');if(shutter)shutter.disabled=!getActiveUSB();
  captureDrawer.disabled=!getActiveUSB();
  floatingCapture.disabled=!getActiveUSB();
 }
 setInterval(attach,1200);
 setInterval(()=>{if(!drawer.hidden){void refresh();void refreshWirelessOriginals();void refreshLocalCloud()}void pollOriginals()},6000);attach();void pollOriginals();void refreshWirelessOriginals();void refreshLocalCloud();
}
