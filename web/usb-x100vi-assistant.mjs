/** FujiX Sync's local Creative Mac USB convenience control.
 * Acts on the existing original Library React controls — it NEVER invents a
 * camera feed, pairs BLE, or triggers a still shutter. Native macOS UVC
 * detection comes from the localhost-only Mac backend.
 */
const here = new URL(location.href);
if (here.hostname === 'localhost' || here.hostname === '127.0.0.1') {
  const style=document.createElement('style');style.textContent=`
  #fujix-usb-bridge-assistant{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:9px;width:100%;padding:11px 13px;border:1px solid #34383c;border-radius:11px;background:#111113;box-shadow:none;color:#c9d2df;font:11px/1.4 ui-sans-serif,system-ui,sans-serif}
  #fujix-usb-bridge-assistant button{flex-shrink:0;padding:8px 10px;border-radius:8px;border:1px solid #078dca;background:#079ee4;color:#071019;font:600 11px ui-sans-serif,system-ui;cursor:pointer}#fujix-usb-bridge-assistant button:disabled{background:#374151;border-color:#485260;color:#b6b8bf;cursor:not-allowed}
  #fujix-usb-bridge-assistant .fujix-usb-indicator{display:inline-block;flex:none;height:7px;width:7px;border-radius:50%;background:#6b7280}#fujix-usb-bridge-assistant[data-camera='detected'] .fujix-usb-indicator{background:#38bdf8}
  #fujix-usb-bridge-assistant[data-live='true']{opacity:.98}
  #fujix-usb-bridge-assistant[data-live='true'] #fujix-usb-start{display:none}
  #fujix-usb-bridge-assistant[data-live='true'] .fujix-usb-indicator{background:#34d399}
  #fujix-usb-photo-controls{border:1px solid #282b31;border-radius:15px;background:#111113;color:#eee;margin:16px 0;padding:16px;font:12px/1.5 ui-sans-serif,system-ui,sans-serif}
  #fujix-usb-photo-controls .fujix-photo-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
  #fujix-usb-photo-controls h3{font-weight:700;font-size:16px;margin:0}
  #fujix-usb-photo-controls p{margin:6px 0;color:#999ba5}
  #fujix-usb-photo-controls .fujix-photo-buttons{display:flex;gap:8px;flex-wrap:wrap}
  #fujix-usb-photo-controls button{border:1px solid #3a414b;border-radius:9px;background:#26282e;color:#f8f8fb;padding:10px 13px;font:600 12px ui-sans-serif,system-ui;cursor:pointer}
  #fujix-usb-photo-controls button:first-child{background:#0ea5e9;border-color:#0ea5e9;color:#071019}
  #fujix-usb-photo-controls button:disabled{opacity:.5;cursor:not-allowed}
  #fujix-usb-capture-status{color:#7dd3fc!important;min-height:17px}
  #fujix-usb-capture-grid{display:none}
  #fujix-usb-capture-grid a{border:1px solid #2e3440;border-radius:10px;overflow:hidden;text-decoration:none;color:#e4e4e7;font-size:10px;display:block;background:#181a21}
  #fujix-usb-capture-grid img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:#090b0e}
  #fujix-usb-capture-grid span{display:block;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #fujix-usb-photo-controls details{margin-top:12px;color:#a0a4af;font-size:11px}#fujix-usb-photo-controls details summary{cursor:pointer;color:#a1d9f9}
  #fujix-usb-photo-controls #fujix-live-shutter,#fujix-usb-photo-controls #fujix-open-photo-folder,#fujix-usb-photo-controls #fujix-refresh-photos{display:none}
  @media (max-width:580px){#fujix-usb-bridge-assistant{flex-wrap:wrap}}`;
  document.head.appendChild(style);
  const toolbar=document.createElement('div');toolbar.id='fujix-usb-bridge-assistant';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','X100VI USB camera connection');toolbar.dataset.camera='checking';
  toolbar.innerHTML='<span class="fujix-usb-indicator"></span><span id="fujix-usb-status" aria-live="polite">Checking USB camera…</span><button type="button" id="fujix-usb-start">Use X100VI USB</button>';
  const msg=toolbar.querySelector('#fujix-usb-status');const start=toolbar.querySelector('#fujix-usb-start');
  const nativeGallery=document.createElement('section');nativeGallery.id='fujix-usb-photo-controls';
  nativeGallery.innerHTML=`<div class="fujix-photo-top"><div><h3>Camera Power & USB</h3><p>Camera AUTO POWER OFF and Mac sleep prevention are separate. Use the Mac Photos panel above to capture JPEG previews or import originals.</p></div><div class="fujix-photo-buttons"><button type="button" id="fujix-live-shutter">Capture live JPEG</button><button type="button" id="fujix-open-photo-folder">Open in Finder</button><button type="button" id="fujix-refresh-photos">Refresh photos</button><button type="button" id="fujix-mac-awake" aria-pressed="false" title="Prevents the Mac going to sleep; camera auto-off still requires a camera-menu setting">Keep Mac Awake: Off</button></div></div><p id="fujix-usb-capture-status" role="status" aria-live="polite"></p><div id="fujix-usb-capture-grid"></div><details><summary>Keep the X100VI awake for a long USB session</summary><p>On the physical camera set MENU/OK → SET UP (wrench) → POWER MANAGEMENT → AUTO POWER OFF → OFF. The Mac cannot change this camera setting through USB WEBCAM. For long shoots set USB POWER SUPPLY/COMM SETTING to AUTO if the Mac supplies adequate power. This does not disable high-temperature safety shutdown.</p><p>The optional Keep Mac Awake button prevents your laptop from sleeping while your browser live view runs; it is not a substitute for the camera setting. It shuts itself off if the browser disconnects.</p><p>To transfer original 40MP photos and RAF, stop live view, choose USB CARD READER on the camera, reconnect, then use Image Capture or import from its card. Simultaneous RAW tethering via USB WEBCAM is not provided by Fujifilm.</p></details>`;
  const captureMsg=nativeGallery.querySelector('#fujix-usb-capture-status');
  const captureButton=nativeGallery.querySelector('#fujix-live-shutter');
  let saving=false;
  async function loadLocalPhotos(){
    const grid=nativeGallery.querySelector('#fujix-usb-capture-grid');
    try{
      const reply=await fetch('/api/usb-captures',{cache:'no-store'});
      if(!reply.ok)throw Error('Native Mac photo library unavailable');
      const result=await reply.json();grid.replaceChildren();
      for(const photo of (result.photos||[]).slice(0,48)){
        if(!/^X100VI-USB-\d{8}-\d{6}-[a-f0-9]{12}\.jpg$/.test(photo.name))continue;
        const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener';link.title='Open original saved USB preview JPEG';
        const img=document.createElement('img');img.src=photo.url;img.loading='lazy';img.alt='X100VI webcam JPEG captured '+new Date(photo.createdAt).toLocaleString();
        const label=document.createElement('span');label.textContent=new Date(photo.createdAt).toLocaleString();link.append(img,label);grid.append(link);
      }
      if(!result.photos?.length){const noPhotos=document.createElement('p');noPhotos.textContent='No native Mac snapshots yet. Capture a live JPEG from the X100VI to start your gallery.';grid.append(noPhotos)}
    }catch(error){captureMsg.textContent=error.message||'Could not load Mac photos';}
  }
  captureButton.addEventListener('click',async()=>{
    if(saving)return;saving=true;captureButton.disabled=true;captureMsg.textContent='Capturing an actual X100VI webcam frame and saving it to your Mac…';
    try{
      const video=getVideo();
      if(!video || !(video.videoWidth>0 && video.videoHeight>0))throw Error('X100VI live view is not active. Press Use X100VI USB and check the camera image.');
      // The SDK verifies the real FUJIFILM USB track label and live video dimensions.
      const {FujiXUsbWebcam}=await import('/sdk/fujix-sdk.mjs');
      const usb=new FujiXUsbWebcam();usb.attachExisting(video);
      const photo=await usb.snapshot({quality:0.94});usb.stop();
      const result=await fetch('/api/usb-captures',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:photo.data});
      const saved=await result.json();if(!result.ok||!saved.ok)throw Error(saved.error||'Native photo save failed');
      captureMsg.textContent=`Saved ${photo.width}×${photo.height} live JPEG to Mac Pictures: ${saved.photo.name}. The camera's physical shutter was not triggered.`;
      await loadLocalPhotos();
    }catch(error){captureMsg.textContent=error.message||'Cannot save X100VI USB photo';}
    finally{saving=false;captureButton.disabled=false}
  });
  nativeGallery.querySelector('#fujix-refresh-photos').addEventListener('click',()=>{void loadLocalPhotos()});
  nativeGallery.querySelector('#fujix-open-photo-folder').addEventListener('click',async()=>{
    try{const response=await fetch('/api/usb-captures/open-folder',{method:'POST'});const result=await response.json();if(!response.ok)throw Error(result.error);captureMsg.textContent='Opened Mac Pictures → FujiX Sync → USB Live Captures in Finder.'}
    catch(error){captureMsg.textContent=error.message||'Cannot open Mac photo folder'}
  });
  const wakeButton=nativeGallery.querySelector('#fujix-mac-awake');
  let wakeEnabled=false;
  wakeButton.addEventListener('click',async()=>{
    wakeButton.disabled=true;
    try{
      if(!wakeEnabled){
        const video=getVideo();const track=video?.srcObject?.getVideoTracks?.()[0];
        if(track?.readyState!=='live'||!(video.videoWidth>0))throw Error('Start the real X100VI USB live video before asking the Mac to stay awake.');
      }
      const response=await fetch(wakeEnabled?'/api/mac/awake/stop':'/api/mac/awake/start',{method:'POST'});
      const value=await response.json();if(!response.ok)throw Error(value.error||'Cannot update Mac wake lock');
      wakeEnabled=!!value.active;
      wakeButton.textContent=`Keep Mac Awake: ${wakeEnabled?'On':'Off'}`;wakeButton.setAttribute('aria-pressed',String(wakeEnabled));
      captureMsg.textContent=wakeEnabled?'Mac sleep prevention enabled while the USB live view remains connected. Set camera Auto Power Off → OFF separately.':'Mac sleep prevention disabled; camera settings unchanged.';
    }catch(error){captureMsg.textContent=error.message||'Mac awake setting failed'}
    finally{wakeButton.disabled=false}
  });
  setInterval(async()=>{
    if(!wakeEnabled)return;
    const video=getVideo();const track=video?.srcObject?.getVideoTracks?.()[0];
    if(track?.readyState!=='live'||!(video.videoWidth>0)){
      wakeEnabled=false;wakeButton.textContent='Keep Mac Awake: Off';wakeButton.setAttribute('aria-pressed','false');
      void fetch('/api/mac/awake/stop',{method:'POST'}).catch(()=>{});return;
    }
    try{
      const response=await fetch('/api/mac/awake/heartbeat',{method:'POST'});
      const value=await response.json();if(!value.active)wakeEnabled=false;
    }catch{wakeEnabled=false}
    if(!wakeEnabled){wakeButton.textContent='Keep Mac Awake: Off';wakeButton.setAttribute('aria-pressed','false')}
  },20000);
  window.addEventListener('pagehide',()=>{if(wakeEnabled)navigator.sendBeacon?.('/api/mac/awake/stop','')});
  let busy=false;let detected=false;let lastVideoId='';let informativeStatusUntil=0;
  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  async function readMacStatus(){
    try{
      const reply=await fetch('/api/direct/usb/status',{cache:'no-store',signal:AbortSignal.timeout(5500)});
      if(!reply.ok)throw Error('USB status unavailable');
      const value=await reply.json();detected=value.cameraPresent===true;
      toolbar.dataset.camera=detected?'detected':'missing';
      const preview=getVideo();
      const previewTrack=preview?.srcObject?.getVideoTracks?.()[0];
      const live=previewTrack?.readyState==='live'&&preview.videoWidth>0&&preview.videoHeight>0;
      toolbar.dataset.live=live?'true':'false';
      if(!busy){if(live||Date.now()>informativeStatusUntil)msg.textContent=live?`X100VI USB LIVE · ${preview.videoWidth}×${preview.videoHeight}`:detected?'X100VI USB webcam detected':'X100VI USB not detected; wake camera / reconnect cable';start.disabled=!detected||live;start.textContent=live?'USB Live Active':'Use X100VI USB';}
    }catch{detected=false;toolbar.dataset.camera='missing';if(!busy){if(Date.now()>informativeStatusUntil)msg.textContent='USB status unavailable; check camera connection';start.disabled=true;start.textContent='Use X100VI USB'}}
  }
  function getVideo(){return document.querySelector('video[data-testid="fujix-live-video"]')}
  function attach(){
    // Keep USB helper in Library tools, not over the wireless viewfinder.
    const target=document.getElementById('fujix-mac-controls-inline-target');
    if(!target)return;
    if(toolbar.parentElement!==target)target.prepend(toolbar);
    const panel=document.getElementById('fujix-live-panel');
    if(panel && nativeGallery.previousElementSibling!==panel)panel.insertAdjacentElement('afterend',nativeGallery);
  }
  const syncLayout=()=>{attach();};
  const observer=new MutationObserver(()=>{if(!toolbar.isConnected)queueMicrotask(syncLayout)});
  observer.observe(document.getElementById('root') || document.body,{childList:true,subtree:true});
  window.addEventListener('popstate',syncLayout);
  function setReactSelect(select,value){
    const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');descriptor.set.call(select,value);
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function useUSB(){
    if(busy)return;
    busy=true;start.disabled=true;msg.textContent='Locating your real Fujifilm USB input…';
    try{
      const video=getVideo();if(!video)throw Error('Open Library to access the live-view monitor.');
      await readMacStatus();if(!detected)throw Error('The X100VI USB camera is no longer present. Wake it, keep USB WEBCAM selected, and reconnect its cable.');
      const direct=document.getElementById('fujix-live-mode-direct');
      if(!direct)throw Error('Original FujiX Sync USB/HDMI panel could not be found.');
      if(direct.getAttribute('aria-pressed')!=='true'){direct.click();await sleep(350)}
      const sourcePicker=()=>document.getElementById('fujix-video-source');
      let select=sourcePicker();
      const findUsableFuji=()=>[...(select?.options||[])].find(opt=>opt.value && (/^(?:FUJIFILM\s*)?X100VI\b/i.test(opt.textContent.trim())||/\bFUJIFILM\b.*\bX100VI\b/i.test(opt.textContent)));
      let option=findUsableFuji();
      if(!option){
        msg.textContent='Requesting Chrome camera access; any temporary camera track will be stopped immediately…';
        // Chrome may list a camera label with an EMPTY deviceId until this
        // origin is explicitly granted camera access. Merely refreshing the
        // select list cannot fix that, even when macOS sees the USB camera.
        const media=navigator.mediaDevices;
        if(!media?.getUserMedia)throw Error('Chrome camera API unavailable. Please open FujiX Sync in Chrome on this Mac.');
        let perm=null;
        try{perm=await navigator.permissions?.query?.({name:'camera'})}catch{}
        if(perm?.state==='denied')throw Error('Chrome Camera permission is blocked for 127.0.0.1:4194. Use the site-controls icon beside the address bar → Site settings → Camera → Allow, then retry.');
        let initialStream;
        try{
          initialStream=await media.getUserMedia({video:true,audio:false});
        }catch(cause){
          if(cause?.name==='NotAllowedError'||cause?.name==='PermissionDeniedError')throw Error('Chrome did not receive camera permission. In the site controls beside the address bar, choose Camera → Allow for 127.0.0.1:4194.');
          if(cause?.name==='NotFoundError')throw Error('Chrome sees no usable video devices even though macOS intermittently sees the X100VI. Check USB WEBCAM, wake the camera, reconnect its USB-C cable, and check macOS Privacy & Security → Camera → Chrome.');
          throw Error(`Chrome camera permission/open error: ${cause?.name||'unknown'}. Check Chrome and macOS camera permissions.`);
        }finally{initialStream?.getTracks?.().forEach(track=>track.stop())}
        // Request a React refresh AFTER the browser grants the device IDs.
        const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Identify / refresh inputs'));
        if(!refresh)throw Error('Camera device refresh control is unavailable.');
        refresh.click();
        for(let i=0;i<32;i++){
          await sleep(400);
          select=sourcePicker();option=findUsableFuji();
          if(option)break;
        }
      }
      if(!option||!select)throw Error('Chrome has not exposed a usable X100VI camera device ID. Allow this site camera access and confirm X100VI is selected in Chrome camera settings, then retry.');
      const actualId=option.value;
      lastVideoId=actualId;
      setReactSelect(select,actualId);
      await sleep(250);
      const originalStart=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Start X100VI live view');
      if(!originalStart)throw Error('Original FujiX Sync Start X100VI live view control is missing.');
      msg.textContent='Starting camera USB video…';
      originalStart.click();
      let good=false;
      for(let i=0;i<32;i++){
        await sleep(250);
        const v=getVideo();const track=v?.srcObject?.getVideoTracks?.()[0];const settings=track?.getSettings?.()||{};
        if(v && track && track.readyState==='live' && v.videoWidth>0 && v.videoHeight>0 && (!settings.deviceId||settings.deviceId===actualId)){
          msg.textContent=`X100VI USB live video: ${v.videoWidth}×${v.videoHeight}`;good=true;break;
        }
      }
      if(!good)throw Error('No verified moving video frames arrived from X100VI. Check Chrome Camera permission and USB webcam mode.');
    }catch(error){msg.textContent=error?.message||'USB webcam connection failed';informativeStatusUntil=Date.now()+60000;}
    finally{busy=false;start.disabled=!detected;}
  }
  start.addEventListener('click',()=>{void useUSB()});
  attach();void readMacStatus();void loadLocalPhotos();setInterval(()=>{attach();void readMacStatus()},5000);
}
