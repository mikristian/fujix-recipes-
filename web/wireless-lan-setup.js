/* X100VI Wireless LAN onboarding. No WPS PIN is requested, stored or transmitted. */
(() => {
  'use strict';
  if (document.getElementById('fujix-wlan-open')) return;
  const trigger = document.createElement('button');
  trigger.id = 'fujix-wlan-open';
  trigger.type = 'button';
  trigger.textContent = 'Camera Wi-Fi Setup';
  trigger.setAttribute('aria-haspopup', 'dialog');
  document.body.append(trigger);

  const backdrop = document.createElement('div');
  backdrop.id = 'fujix-wlan-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section id="fujix-wlan-dialog" role="dialog" aria-modal="true" aria-labelledby="fujix-wlan-title" tabindex="-1">
      <header class="fujix-wlan-heading">
        <div><span class="fujix-wlan-eyebrow">FUJIX SYNC · X100VI</span><h2 id="fujix-wlan-title">Camera connection setup</h2><p>Wireless setup and Bluetooth troubleshooting.</p></div>
        <button id="fujix-wlan-close" class="fujix-wlan-icon" type="button" aria-label="Close Wi-Fi setup">×</button>
      </header>
      <nav class="fujix-wlan-tabs" aria-label="Wireless setup type">
        <button type="button" id="fujix-wlan-tether" aria-pressed="false">Tether Studio</button>
        <button type="button" id="fujix-wlan-direct" aria-pressed="true">Remote control + live view</button>
        <button type="button" id="fujix-wlan-photos" aria-pressed="false">Camera Photos</button>
        <button type="button" id="fujix-wlan-bluetooth" aria-pressed="false">Bluetooth repair</button>
        <button type="button" id="fujix-wlan-lan" aria-pressed="false">Saved home Wi-Fi</button>
        <button type="button" id="fujix-wlan-wps" aria-pressed="false">Wireless LAN · WPS PIN</button>
      </nav>
      <div id="fujix-wlan-tether-guide" class="fujix-wlan-guide" hidden>
        <p class="fujix-wlan-lead"><strong>FujiX Local Tether — direct from your X100VI</strong>. Camera originals are automatically retrieved from the camera's Wi-Fi gallery into your Mac's local Pictures folder. No Frame.io account or cloud storage is needed.</p>
        <div class="fujix-wlan-tether-setup">
          <strong>Direct camera photo transfer · Experimental</strong>
          <p>First connect the Mac to the X100VI's own Wi-Fi using the existing Bluetooth handoff. Stop native Wi-Fi live view; image gallery and remote live view currently require different Fujifilm camera modes. Click <strong>Start monitoring new shots</strong> to record a baseline of existing SD photos, then take new pictures. Only new originals are downloaded automatically, never deleted from the camera.</p>
          <p id="fujix-wlan-direct-transfer-status" role="status" aria-live="polite">Checking native X100VI gallery transfer readiness…</p>
          <div class="fujix-wlan-recovery-actions"><button id="fujix-wlan-direct-transfer-start" type="button">Start monitoring new shots</button><button id="fujix-wlan-direct-transfer-stop" type="button">Stop monitoring</button></div>
          <p class="fujix-wlan-note">Important: direct wireless gallery transfer is not yet physically verified on this X100VI. If the camera declines the gallery connection, FujiX Sync will not claim a photo was transferred. Your Mac's usual Wi-Fi Internet can be interrupted while connected directly to the camera.</p>
        </div>
        <p class="fujix-wlan-note">For alternative transfer methods (such as a card reader or a watched Finder folder), the review system below works independently of the direct camera connection.</p>
        <div class="fujix-wlan-tether-setup">
          <label for="fujix-wlan-tether-folder">Watch folder (paste a Finder folder pathname)</label>
          <div class="fujix-wlan-ip-row"><input id="fujix-wlan-tether-folder" spellcheck="false" autocomplete="off" placeholder="~/Pictures/FujiX Sync Incoming" value="~/Pictures/FujiX Sync Incoming"/><button id="fujix-wlan-tether-set-folder" type="button">Watch folder</button></div>
          <p class="fujix-wlan-note">Direct camera originals are saved to <strong>~/Pictures/FujiX Sync Incoming</strong>. To review another authorized photo folder, select it in Finder, press <strong>Option + Command + C</strong> to copy its path, and paste it above. Source photos in watched folders are never modified.</p>
          <p id="fujix-wlan-tether-status" role="status" aria-live="polite">No folder is watched yet.</p>
          <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-tether-refresh">Refresh photos</button><button type="button" id="fujix-wlan-tether-latest">Review newest photo</button></div>
        </div>
        <div class="fujix-wlan-tether-review" id="fujix-wlan-tether-review" hidden>
          <strong id="fujix-wlan-tether-current-name">Latest photograph</strong>
          <img id="fujix-wlan-tether-image" hidden alt="Original photo delivered to the watched folder"/>
          <p id="fujix-wlan-tether-current-info"></p>
          <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-tether-download">Download original</button><button type="button" id="fujix-wlan-tether-save">Save to FujiX Library</button></div>
        </div>
        <div id="fujix-wlan-tether-items" class="fujix-wlan-photo-list"></div>
        <p class="fujix-wlan-note"><strong>Live preview:</strong> In Library use the real <strong>USB / HDMI</strong> video source, if you have a capture card. Fully wireless live view is experimental through X100VI PTP/IP. Continuous simultaneous native Wi-Fi gallery downloads and live preview are not verified; use one camera mode at a time.</p>
      </div>
      <div id="fujix-wlan-direct-guide" class="fujix-wlan-guide">
        <p class="fujix-wlan-lead">Use the camera's temporary Wi-Fi hotspot for the experimental Mac live-view bridge. Bluetooth may be used to request that hotspot.</p>
        <div class="fujix-wlan-handoff-panel">
          <strong>Already took a photo with FujiX Sync's Bluetooth shutter?</strong>
          <p>Keep the same Chrome tab and Bluetooth connection open. You do <strong>not</strong> need to pair again. The existing camera session can request the X100VI's Wi-Fi hotspot without disturbing the working shutter code.</p>
          <p id="fujix-wlan-ble-handoff-status" role="status" aria-live="polite">Checking the Library's existing Bluetooth shutter connection…</p>
          <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-go-wifi-activation">Go to Bluetooth → Wi-Fi activation</button><button type="button" id="fujix-wlan-refresh-handoff">Check shutter connection</button></div>
          <p>In Library, select <strong>Direct Mac Wi-Fi</strong>, click <strong>Activate camera Wi-Fi via Bluetooth</strong>, then <strong>Join selected X100VI Wi-Fi</strong> after confirming the network. Start live view only after the camera Wi-Fi check passes. The Mac may temporarily lose normal Internet Wi-Fi.</p>
        </div>
        <div class="fujix-wlan-handoff-panel">
          <strong>Allow Mac to find X100VI Wi-Fi networks</strong>
          <p>Mac Wi-Fi discovery found nearby networks, but macOS concealed their names. FujiX Sync needs macOS Location Services permission to read Wi-Fi SSIDs. This helper does not request your geographic coordinates. Grant permission only if you want the app to use nearby network names.</p>
          <p id="fujix-wlan-location-status" role="status" aria-live="polite">Checking Wi-Fi network-name permission…</p>
          <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-location-allow">Request macOS Wi-Fi discovery permission</button><button type="button" id="fujix-wlan-location-check">Check Wi-Fi discovery</button></div>
          <p>If macOS denies the request, go to <strong>System Settings → Privacy & Security → Location Services</strong> and allow <strong>FujiX Sync Wi-Fi Helper</strong>. This does not change camera Bluetooth pairings or stored photographs.</p>
        </div>
        <ol><li>On the X100VI, turn <strong>Airplane Mode OFF</strong> and <strong>Bluetooth ON</strong>. Keep the camera awake.</li>
        <li>Open <strong>Library → Direct Mac Wi-Fi</strong>. If the BLE shutter is still connected, preserve that connection; otherwise reconnect it first.</li>
        <li>Use <strong>Activate camera Wi-Fi via Bluetooth</strong> in Library, or use the camera's wireless communication flow to activate its own hotspot.</li>
        <li>Join the camera's actual Fujifilm Wi-Fi network with its displayed network password, not the WPS PIN. Mac internet may disconnect.</li>
        <li>In Library, select <strong>Check Camera Wi-Fi</strong>, then <strong>Start Direct Wi-Fi Live View</strong>. Video is live only after actual frames arrive.</li></ol>
        <div class="fujix-wlan-live-panel"><strong>X100VI Live Monitor</strong><p>Displays only verified camera frames received through this Mac's native Wi-Fi bridge. No webcam or synthetic frames will substitute for the camera.</p>
          <img id="fujix-wlan-camera-live" alt="Verified live view from Fujifilm X100VI" hidden/>
          <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-live-start">Start native live view</button><button type="button" id="fujix-wlan-live-stop">Stop live view</button></div>
          <p id="fujix-wlan-live-status" aria-live="polite">Checking native camera feed…</p></div>
        <div class="fujix-wlan-capture-panel"><strong>Experimental camera Wi-Fi shutter</strong><p>One real PTP/IP capture command can be attempted only after this Mac verifies an X100VI session with recent camera frames. A command acknowledgement is not proof a photo was saved. Check the camera SD card.</p><button type="button" id="fujix-wlan-wifi-shutter" disabled>Attempt one X100VI Wi-Fi photo</button><p id="fujix-wlan-wifi-shutter-status" aria-live="polite">Checking whether an X100VI live session is verified…</p></div>
        <p class="fujix-wlan-note">This third-party native connection is experimental on the physical X100VI; successful Wi-Fi association alone does not prove shutter or live view compatibility.</p>
        <a class="fujix-wlan-link" href="/?tab=library">Open Library controls</a>
      </div>
      <div id="fujix-wlan-photos-guide" class="fujix-wlan-guide" hidden>
        <p class="fujix-wlan-lead">Browse original pictures reported by the X100VI's Wi-Fi image gallery and choose which to transfer to FujiX Sync. This is different from the live-view JPEG snapshot and is experimental on this firmware.</p>
        <p class="fujix-wlan-note"><strong>Important:</strong> Finish and stop direct Wi-Fi live view before accessing camera files. The camera must permit a separate image-gallery PTP/IP session. If your shutter works through FUJIFILM XApp on a phone rather than directly from this Mac, transfer files in XApp and then use the existing FujiX Sync Library import control.</p>
        <div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-photo-refresh">Browse camera photos</button><button type="button" id="fujix-wlan-photo-import">Import existing files into Library</button></div>
        <p id="fujix-wlan-photo-status" class="fujix-wlan-bt-result" aria-live="polite">No camera photos listed. No transfer occurs until you request it.</p>
        <div id="fujix-wlan-photo-list" class="fujix-wlan-photo-list"></div>
        <div id="fujix-wlan-photo-selected" class="fujix-wlan-photo-selected" hidden><strong id="fujix-wlan-photo-filename"></strong><img id="fujix-wlan-photo-preview" alt="Selected original X100VI photo" hidden/><p id="fujix-wlan-photo-info"></p><div class="fujix-wlan-recovery-actions"><button type="button" id="fujix-wlan-photo-save">Save to FujiX Library</button><button type="button" id="fujix-wlan-photo-download">Download original</button></div></div>
        <input type="file" id="fujix-wlan-photo-picker" multiple accept=".jpg,.jpeg,.png,.heif,.heic,.raf,.tiff,.tif,.mp4,.mov" hidden/>
      </div>
      <div id="fujix-wlan-bluetooth-guide" class="fujix-wlan-guide" hidden>
        <p class="fujix-wlan-lead">Your FujiX Sync Bluetooth shutter has now successfully triggered the physical X100VI. Older native diagnostic attempts failed, but they do not override this successful camera test. <strong>Do not reset or unpair a working camera connection.</strong></p>
        <p class="fujix-wlan-note">Fujifilm's Bluetooth shutter characteristic transmits commands, not live video or full-size photos. If the Bluetooth shutter works, use the <strong>Remote control + live view</strong> tab to request the camera's direct Wi-Fi hotspot instead of repeating pairing diagnostics. The router WPS PIN is unrelated.</p>
        <ol><li>Close any active <strong>FUJIFILM XApp</strong> remote session on your phone. Leave your existing pairing records intact.</li>
        <li>On the X100VI keep Bluetooth ON, Airplane Mode OFF, then open <strong>Bluetooth/Smartphone Setting → Pairing Registration</strong>.</li>
        <li>Open <strong>macOS System Settings → Bluetooth</strong>. If X100VI appears, try pairing there and approve any matching codes on both devices. Do not reset all camera wireless settings.</li>
        <li>Review the Mac Bluetooth diagnostic below. If macOS offers no successful pairing, the browser cannot force the required bond. For dependable live video now use <strong>X100VI USB Webcam</strong> mode or FUJIFILM XApp on your phone.</li></ol>
        <div class="fujix-wlan-recovery-actions"><button id="fujix-wlan-open-bt-settings" type="button">Open Mac Bluetooth settings</button><button id="fujix-wlan-refresh-bt" type="button">Review last diagnosis</button></div>
        <p id="fujix-wlan-bt-result" role="status" aria-live="polite" class="fujix-wlan-bt-result">No successful secure Bluetooth session has been verified.</p>
        <p class="fujix-wlan-note">This recovery panel never unpairs the camera, fires the shutter, or modifies camera settings.</p>
      </div>
      <div id="fujix-wlan-lan-guide" class="fujix-wlan-guide" hidden>
        <p class="fujix-wlan-lead">An ordinary saved Wi-Fi router or extender network is different from the camera's own hotspot. Fujifilm documents registered router networks for Frame.io upload, not guaranteed Mac live view.</p>
        <ol><li>On the X100VI open Network/USB Setting → Network Setting and select your saved home Wi-Fi. A saved network does not necessarily mean the camera is currently connected.</li><li>Check Network/USB Setting → Information for the camera's current wireless IP, or consult your router's connected-device list.</li><li>Enter only the X100VI address, then test the Fujifilm PTP/IP service and identity. The Mac stays on its home Wi-Fi.</li></ol>
        <label for="fujix-wlan-camera-ip">Camera local IP address</label>
        <div class="fujix-wlan-ip-row"><input id="fujix-wlan-camera-ip" autocomplete="off" inputmode="decimal" placeholder="Camera IP address"/><button type="button" id="fujix-wlan-lan-check">Test camera IP</button></div>
        <p id="fujix-wlan-lan-result" aria-live="polite" class="fujix-wlan-result">No camera service tested yet.</p>
        <div class="fujix-wlan-recovery-actions"><button id="fujix-wlan-lan-identify" type="button">Identify X100VI on home Wi-Fi</button><button id="fujix-wlan-lan-start" type="button" disabled>Start automatic local RAW/JPEG transfer</button><button id="fujix-wlan-lan-stop" type="button" disabled>Stop LAN transfer</button></div>
        <p id="fujix-wlan-lan-transfer-status" role="status" aria-live="polite">No home-router camera gallery verified. Files are only downloaded if the camera accepts a Fujifilm PTP/IP session and the gallery lists new originals.</p>
        <p class="fujix-wlan-note">An open port is not proof of X100VI identity. The X100VI may use this home network exclusively for outbound Frame.io uploads and reject inbound PTP/IP. If so, this direct-router workflow will remain unavailable without a new camera-side protocol.</p>
      </div>
      <div id="fujix-wlan-wps-guide" class="fujix-wlan-guide" hidden>
        <p class="fujix-wlan-lead">The 8-digit PIN shown on your camera is for <strong>registering the camera with a WPS-capable router</strong>. It is not a Mac Wi-Fi password, a Bluetooth code, or a live-view activation code.</p>
        <p class="fujix-wlan-note"><strong>Using a T-Mobile Home Internet gateway?</strong> T-Mobile documents that its gateways do not have a WPS button. If your gateway does not offer WPS PIN enrollment, choose <strong>Manual Setup</strong> on the X100VI and enter your ordinary Wi-Fi network name and password instead.</p>
        <ol><li>On your X100VI open <strong>MENU/OK → Network/USB Setting → Network Setting → Not Created → Access Point Setting → Simple Setup</strong>.</li>
        <li>Select <strong>Connect by PIN Code</strong> and leave the camera on that screen.</li>
        <li>Sign in to your own router's admin interface. Locate its <strong>WPS → Add device by PIN</strong> option and enter the <em>current camera-displayed PIN there</em>. Do not enter it in FujiX Sync or the Mac's Wi-Fi password box.</li>
        <li>Once the router confirms registration, press <strong>MENU/OK</strong> on the camera. If your router does not offer WPS PIN entry, return to the camera and use <strong>Manual Setup</strong> to choose the router SSID and its normal password instead.</li>
        <li>For supported Frame.io uploads, open <strong>Network/USB Setting → Frame.io Camera to Cloud → Connect</strong> and complete the separate Frame.io pairing process.</li></ol>
        <p class="fujix-wlan-note">Joining your home router via WPS does <strong>not</strong> enable Mac live view or a remote shutter. For those features use the <strong>Remote control + live view</strong> tab above. WPS PINs are never saved by this app.</p>
        <a class="fujix-wlan-link" href="https://app.fujifilm-dsc.com/en/manual/x100vi/connections/frameio_upload/" target="_blank" rel="noopener noreferrer">Read Fujifilm's official setup steps</a>
      </div>
      <footer class="fujix-wlan-footer"><div><strong>Mac connection check</strong><p id="fujix-wlan-status" aria-live="polite">Not checked yet. Camera association has not been verified.</p></div><button type="button" id="fujix-wlan-check">Check connection</button></footer>
    </section>`;
  document.body.append(backdrop);
  const dialog = backdrop.querySelector('#fujix-wlan-dialog');
  const directButton = backdrop.querySelector('#fujix-wlan-direct');
  const tetherButton = backdrop.querySelector('#fujix-wlan-tether');
  const photosButton = backdrop.querySelector('#fujix-wlan-photos');
  const bluetoothButton = backdrop.querySelector('#fujix-wlan-bluetooth');
  const lanButton = backdrop.querySelector('#fujix-wlan-lan');
  const wpsButton = backdrop.querySelector('#fujix-wlan-wps');
  const directGuide = backdrop.querySelector('#fujix-wlan-direct-guide');
  const tetherGuide = backdrop.querySelector('#fujix-wlan-tether-guide');
  const photosGuide = backdrop.querySelector('#fujix-wlan-photos-guide');
  const bluetoothGuide = backdrop.querySelector('#fujix-wlan-bluetooth-guide');
  const lanGuide = backdrop.querySelector('#fujix-wlan-lan-guide');
  const wpsGuide = backdrop.querySelector('#fujix-wlan-wps-guide');
  const statusText = backdrop.querySelector('#fujix-wlan-status');
  const checkButton = backdrop.querySelector('#fujix-wlan-check');
  const bluetoothResult = backdrop.querySelector('#fujix-wlan-bt-result');
  const handoffStatus = backdrop.querySelector('#fujix-wlan-ble-handoff-status');
  const locationStatus = backdrop.querySelector('#fujix-wlan-location-status');
  async function refreshWifiLocation(){
    try {
      const response=await fetch('/api/direct/scan',{cache:'no-store'});
      const data=await response.json();
      if(data.networkNamesHidden){
        locationStatus.textContent='macOS is hiding nearby Wi-Fi names. Helper Location permission: '+(data.permission||'unknown')+'. The camera hotspot cannot yet be reliably discovered.';
      }else if(data.ok){
        const cameraCount=Array.isArray(data.cameras)?data.cameras.length:0;
        locationStatus.textContent=cameraCount?`Camera Wi-Fi network detected (${cameraCount} candidate${cameraCount===1?'':'s'}). Return to the Library and join the correct X100VI hotspot.`:'Wi-Fi network names are visible, but no X100VI hotspot is broadcasting. Request camera Wi-Fi over Bluetooth again if still connected.';
      }else locationStatus.textContent=data.error||'Unable to read Mac Wi-Fi status.';
    }catch{locationStatus.textContent='Local Mac Wi-Fi discovery service is unavailable.';}
  }
  async function requestWifiLocation(){
    const button=backdrop.querySelector('#fujix-wlan-location-allow');button.disabled=true;
    locationStatus.textContent='Opening optional macOS Wi-Fi discovery permission prompt…';
    try{
      const response=await fetch('/api/direct/wifi/authorize',{method:'POST'});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'macOS permission dialog did not open');
      locationStatus.textContent='Review the macOS permission prompt for FujiX Sync Wi-Fi Helper. Grant only if you want nearby Wi-Fi network names available to this app. Then press Check Wi-Fi discovery.';
    }catch(error){locationStatus.textContent=error.message||'Open System Settings → Privacy & Security → Location Services manually.'}
    finally{button.disabled=false}
  }
  function refreshHandoffStatus(){
    const existing=window.document.querySelector('#fujix-ble-connect');
    const shutter=window.document.querySelector('#fujix-shutter-release');
    const linked=existing?.textContent?.trim().startsWith('Disconnect') && shutter && !shutter.disabled;
    handoffStatus.textContent=linked
      ? 'The existing FujiX Sync Bluetooth shutter appears connected in this tab. Keep it connected and activate the camera Wi-Fi in the Library.'
      : existing
        ? 'FujiX Sync has no currently enabled Bluetooth shutter control in this tab. Reconnect using the Library shutter panel before activating camera Wi-Fi.'
        : 'Open the Library tab in this same FujiX Sync window to inspect the existing Bluetooth shutter session.';
  }
  function focusExistingHandoff(){
    const buttons=Array.from(document.querySelectorAll('button'));
    const action=buttons.find(b=>b.textContent?.includes('Activate camera Wi-Fi via Bluetooth'));
    if(action){
      close();action.scrollIntoView({behavior:'smooth',block:'center'});action.focus();
      // Deliberately leave the camera-side activation to the user's own click.
    }else{
      handoffStatus.textContent='Switch to Library → Direct Mac Wi-Fi in this tab, then use Activate camera Wi-Fi via Bluetooth.';
    }
  }
  const photoStatus = backdrop.querySelector('#fujix-wlan-photo-status');
  const photoList = backdrop.querySelector('#fujix-wlan-photo-list');
  const selectedPhotoPanel = backdrop.querySelector('#fujix-wlan-photo-selected');
  const photoPreview = backdrop.querySelector('#fujix-wlan-photo-preview');
  const photoPicker = backdrop.querySelector('#fujix-wlan-photo-picker');
  const tetherFolderInput = backdrop.querySelector('#fujix-wlan-tether-folder');
  const tetherStatusText = backdrop.querySelector('#fujix-wlan-tether-status');
  const tetherItems = backdrop.querySelector('#fujix-wlan-tether-items');
  const tetherReview = backdrop.querySelector('#fujix-wlan-tether-review');
  const tetherImage = backdrop.querySelector('#fujix-wlan-tether-image');
  const directTransferText = backdrop.querySelector('#fujix-wlan-direct-transfer-status');
  const directTransferStart = backdrop.querySelector('#fujix-wlan-direct-transfer-start');
  const directTransferStop = backdrop.querySelector('#fujix-wlan-direct-transfer-stop');
  let tetherTimer=null, tetherNewest=null, tetherCurrent=null, tetherFiles=[];
  async function refreshDirectTransfer(){
    try{
      const response=await fetch('/api/direct/auto-transfer/status',{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw Error('Direct transfer service unavailable.');
      directTransferStart.disabled=Boolean(data.active);directTransferStop.disabled=!data.active;
      directTransferText.textContent=data.active
        ? `Monitoring new X100VI photos every ${data.pollSeconds} seconds. ${data.imported} original${data.imported===1?'':'s'} received. ${data.error||'Waiting for new camera photos.'}`
        : `Local camera transfer: ${data.state||'off'}. ${data.error||'Connect to the X100VI direct Wi-Fi, stop live view, then start monitoring.'}`;
    }catch{directTransferText.textContent='Direct camera transfer service unavailable.';directTransferStart.disabled=true}
  }
  async function setDirectTransfer(active){
    const button=active?directTransferStart:directTransferStop;
    button.disabled=true;
    directTransferText.textContent=active?'Checking X100VI identity and recording existing SD-card files…':'Stopping native camera gallery monitoring…';
    try{
      const response=await fetch('/api/direct/auto-transfer/'+(active?'start':'stop'),{method:'POST'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'The camera did not approve this transfer operation.');
      await refreshDirectTransfer();
    }catch(e){directTransferText.textContent=e.message||'The camera transfer operation failed.';button.disabled=false}
  }
  function stopTetherTimer(){if(tetherTimer){clearInterval(tetherTimer);tetherTimer=null}}
  function reviewTetherPhoto(item){
    if(!item)return;
    tetherCurrent=item;tetherReview.hidden=false;
    backdrop.querySelector('#fujix-wlan-tether-current-name').textContent=item.name;
    backdrop.querySelector('#fujix-wlan-tether-current-info').textContent=`${(item.size/1048576).toFixed(1)} MB · ${item.format.toUpperCase()} · Original file from watched folder`;
    tetherImage.removeAttribute('src');tetherImage.hidden=true;
    if(['jpg','jpeg','png'].includes(item.format)){
      tetherImage.src='/api/tether/files/'+item.id+'?preview=1';tetherImage.hidden=false;
    }
  }
  function drawTetherFiles(files){
    tetherItems.replaceChildren();
    for(const file of files.slice(0,50)){
      const entry=document.createElement('button');entry.type='button';entry.className='fujix-wlan-photo-entry';
      const name=document.createElement('strong');name.textContent=file.name;
      const detail=document.createElement('span');detail.textContent=`${file.format.toUpperCase()} · ${(file.size/1048576).toFixed(1)} MB`;
      entry.append(name,detail);entry.addEventListener('click',()=>reviewTetherPhoto(file));tetherItems.append(entry);
    }
  }
  async function refreshTether(){
    void refreshDirectTransfer();
    try{
      const response=await fetch('/api/tether/inbox',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Folder scan could not finish');
      if(!data.configured){tetherStatusText.textContent='Choose an existing folder containing X100VI photos to start monitoring.';return}
      if(data.error){tetherStatusText.textContent=data.error;return}
      const files=data.files||[];tetherFiles=files;
      tetherStatusText.textContent=`Watching ${data.folderLabel}: ${files.length} stable camera files available. The folder is checked every 2.5 seconds while this panel is open.`;
      if(files[0]?.id!==tetherNewest){
        tetherNewest=files[0]?.id||null;drawTetherFiles(files);
        if(files[0])reviewTetherPhoto(files[0]);
      }
    }catch(error){tetherStatusText.textContent=error.message||'Cannot monitor the selected folder.';}
  }
  async function configureTether(){
    const button=backdrop.querySelector('#fujix-wlan-tether-set-folder');button.disabled=true;
    try{
      const response=await fetch('/api/tether/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:tetherFolderInput.value.trim()})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Folder not available');
      tetherNewest=null;tetherCurrent=null;tetherReview.hidden=true;tetherItems.replaceChildren();
      stopTetherTimer();await refreshTether();tetherTimer=setInterval(()=>void refreshTether(),2500);
    }catch(error){tetherStatusText.textContent=error.message||'Select a valid existing folder.';}
    finally{button.disabled=false}
  }
  async function saveTetherPhoto(){
    if(!tetherCurrent)return;
    if(tetherCurrent.size>128*1024*1024){tetherStatusText.textContent='This original is too large for browser Library storage. Use Download original instead.';return}
    const chosen=tetherCurrent;
    try{
      const response=await fetch('/api/tether/files/'+chosen.id);
      if(!response.ok)throw Error('Original photo unavailable; rescan folder.');
      const blob=await response.blob();if(blob.size!==chosen.size)throw Error('Original file is incomplete.');
      await storeLibraryPhoto(chosen.name,blob);
      tetherStatusText.textContent='Saved '+chosen.name+' to FujiX Sync Library. Open Saved Photos → Refresh.';
    }catch(error){tetherStatusText.textContent=error.message||'Could not import photo.';}
  }
  const liveImage = backdrop.querySelector('#fujix-wlan-camera-live');
  const liveStatus = backdrop.querySelector('#fujix-wlan-live-status');
  const liveStart = backdrop.querySelector('#fujix-wlan-live-start');
  const liveStop = backdrop.querySelector('#fujix-wlan-live-stop');
  let livePoll=null;
  function stopPollingLive(){if(livePoll){clearInterval(livePoll);livePoll=null}}
  async function updateLiveStatus(){
    try{
      const response=await fetch('/api/direct/status',{cache:'no-store'});
      if(!response.ok)throw Error('Local X100VI bridge offline');
      const result=await response.json();
      if(result.status==='live'&&result.verified&&Number(result.frames)>0){
        liveStatus.textContent=`Verified camera preview: ${result.frames} frames received. The original photo files are in Camera Photos, not this MJPEG feed.`;
        if(!liveImage.getAttribute('src')){liveImage.src='/api/direct/live.mjpg';liveImage.hidden=false}
        stopPollingLive();
      }else if(result.status==='error'){
        liveStatus.textContent=result.detail||'X100VI stream did not start';stopPollingLive();liveImage.hidden=true;liveImage.removeAttribute('src');
      }else if(result.status==='connecting'){
        liveStatus.textContent='Connecting to X100VI Wi-Fi PTP/IP and waiting for actual JPEG frames…';
      }else{
        liveStatus.textContent='No verified camera Wi-Fi live stream. Mac must join the camera hotspot; Bluetooth shutter pairing alone is not video.';
        liveImage.hidden=true;liveImage.removeAttribute('src');stopPollingLive();
      }
    }catch{liveStatus.textContent='Could not check the native X100VI live-view bridge.';stopPollingLive()}
  }
  async function startLive(){
    liveStart.disabled=true;liveStatus.textContent='Checking Mac camera Wi-Fi and starting Fujifilm PTP/IP…';
    try{
      const response=await fetch('/api/direct/start',{method:'POST'});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Camera PTP/IP live view could not start.');
      stopPollingLive();await updateLiveStatus();
      livePoll=setInterval(()=>void updateLiveStatus(),1300);
    }catch(error){liveStatus.textContent=error.message||'Camera live view failed.'}
    finally{liveStart.disabled=false}
  }
  async function stopLive(){
    liveStop.disabled=true;stopPollingLive();
    try{await fetch('/api/direct/stop',{method:'POST'});liveStatus.textContent='Native Wi-Fi live view stopped. You can now browse the camera photo gallery.'}
    catch{liveStatus.textContent='Could not stop the native camera session. Check connection status.'}
    finally{liveImage.hidden=true;liveImage.removeAttribute('src');liveStop.disabled=false;void refreshWifiShutter()}
  }
  liveImage.addEventListener('error',()=>{liveImage.hidden=true;liveImage.removeAttribute('src');liveStatus.textContent='The camera stream did not deliver readable frames; check the X100VI PTP/IP session.'});
  let selectedPhoto = null;
  let selectedBlob = null;
  let selectedPreviewUrl = null;
  let selectedRequestId=0;
  const allowedPhoto = name => /\.(?:jpe?g|png|heif|heic|raf|tiff?|mp4|mov)$/i.test(name);
  function resetSelectedPhoto(){
    selectedRequestId++;
    if(selectedPreviewUrl)URL.revokeObjectURL(selectedPreviewUrl);
    selectedPreviewUrl=null;selectedPhoto=null;selectedBlob=null;
    selectedPhotoPanel.hidden=true;photoPreview.hidden=true;photoPreview.removeAttribute('src');
  }
  async function fetchCameraPhoto(item){
    if(selectedBlob&&selectedPhoto?.handle===item.handle)return selectedBlob;
    const requestId=selectedRequestId;
    const response=await fetch('/api/direct/photos/'+encodeURIComponent(item.handle),{cache:'no-store'});
    if(!response.ok){let detail='The camera could not deliver the original file.';try{detail=(await response.json()).error||detail}catch{}throw Error(detail)}
    const blob=await response.blob();
    if(blob.size!==item.bytes)throw Error('Original photo did not finish transferring; nothing saved.');
    if(requestId!==selectedRequestId||selectedPhoto?.handle!==item.handle)throw Error('Selected photo changed; discarded previous download.');
    selectedBlob=blob;return blob;
  }
  async function openCameraPhoto(item){
    resetSelectedPhoto();selectedPhoto=item;selectedPhotoPanel.hidden=false;
    backdrop.querySelector('#fujix-wlan-photo-filename').textContent=item.name;
    backdrop.querySelector('#fujix-wlan-photo-info').textContent=`${(item.bytes/1048576).toFixed(1)} MB · Original camera file. Loading is manual; never a simulated still.`;
    photoStatus.textContent='Retrieving '+item.name+' from X100VI gallery…';
    try{
      const blob=await fetchCameraPhoto(item);
      if(selectedPhoto?.handle!==item.handle)return;
      if(/\.(jpe?g|png)$/i.test(item.name)){
        selectedPreviewUrl=URL.createObjectURL(blob);photoPreview.src=selectedPreviewUrl;photoPreview.hidden=false;
      }
      photoStatus.textContent=item.name+' downloaded into this browser for preview. Choose Save to Library or Download original to keep it.';
    }catch(error){if(selectedPhoto?.handle===item.handle){photoStatus.textContent=error.message||'Original photo could not be retrieved.';selectedBlob=null}}
  }
  async function browseCameraPhotos(){
    resetSelectedPhoto();photoList.replaceChildren();
    const refresh=backdrop.querySelector('#fujix-wlan-photo-refresh');refresh.disabled=true;
    photoStatus.textContent='Requesting the X100VI image-gallery list. No originals are downloaded yet…';
    try{
      const response=await fetch('/api/direct/photos',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||data.verified!==true)throw Error(data.error||'Camera gallery could not be verified.');
      const items=(data.items||[]).filter(x=>x&&Number.isInteger(x.handle)&&typeof x.name==='string'&&allowedPhoto(x.name));
      photoStatus.textContent=`Camera gallery returned ${data.total||0} files; showing ${items.length} supported originals. Select a photo to view or save it.`;
      for(const item of items){
        const entry=document.createElement('button');entry.type='button';entry.className='fujix-wlan-photo-entry';
        const title=document.createElement('strong');title.textContent=item.name;
        const info=document.createElement('span');info.textContent=`${(item.bytes/1048576).toFixed(1)} MB · ${item.width||'?'} × ${item.height||'?'}`;
        entry.append(title,info);entry.addEventListener('click',()=>void openCameraPhoto(item));photoList.append(entry);
      }
      if(!items.length)photoStatus.textContent='Gallery replied but no supported JPEG, HEIF, RAF or video files were listed. Camera may not expose its SD images in this wireless mode.';
    }catch(error){photoStatus.textContent=(error.message||'Gallery unavailable')+' You can still transfer through FUJIFILM XApp and import the files here.';}
    finally{refresh.disabled=false}
  }
  async function storeLibraryPhoto(name,blob){
    const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('fujix-sync-library-v1',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('photos'))request.result.createObjectStore('photos',{keyPath:'id'})};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Library storage unavailable'));
    });
    try{await new Promise((resolve,reject)=>{const tx=database.transaction('photos','readwrite');
      tx.objectStore('photos').put({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,name,createdAt:Date.now(),source:'imported-photo',mime:blob.type||'application/octet-stream',blob});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Photo save failed'));tx.onabort=()=>reject(tx.error||Error('Photo save aborted'));
    })}finally{database.close()}
  }
  async function saveSelectedPhoto(){
    if(!selectedPhoto||!selectedBlob){photoStatus.textContent='Select and retrieve a camera photo first.';return}
    try{await storeLibraryPhoto(selectedPhoto.name,selectedBlob);photoStatus.textContent=`Saved ${selectedPhoto.name} to FujiX Sync Library. Use Library → Saved Photos → Refresh to see it.`}
    catch(error){photoStatus.textContent=error.message||'Could not save to browser Library';}
  }
  function downloadSelectedPhoto(){
    if(!selectedPhoto||!selectedBlob){photoStatus.textContent='Retrieve a camera photo before downloading.';return}
    const url=URL.createObjectURL(selectedBlob);const anchor=document.createElement('a');anchor.href=url;anchor.download=selectedPhoto.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    photoStatus.textContent='Original download requested for '+selectedPhoto.name+'.';
  }
  const wifiShutterButton = backdrop.querySelector('#fujix-wlan-wifi-shutter');
  const wifiShutterStatus = backdrop.querySelector('#fujix-wlan-wifi-shutter-status');
  async function refreshWifiShutter(){
    wifiShutterButton.disabled=true;
    try{
      const response=await fetch('/api/direct/status',{cache:'no-store'});
      if(!response.ok)throw Error('Camera bridge offline');
      const result=await response.json();
      wifiShutterButton.disabled=!result.shutterAvailable;
      wifiShutterStatus.textContent=result.shutterAvailable
        ? 'Verified X100VI live frames received. This experimental control attempts one PTP capture; photo must be confirmed on SD card.'
        : result.shutterAttempted
          ? 'A Wi-Fi capture was already attempted in this live session. No second shot will be sent automatically.'
          : 'Shutter locked: no verified, active X100VI live-view session with recent camera frames.';
    }catch{wifiShutterStatus.textContent='Cannot confirm camera identity or frames. Shutter remains disabled.';}
  }
  function setMode(mode) {
    const tether = mode==='tether';
    const direct = mode === 'direct';
    const photos = mode === 'photos';
    const bluetooth = mode === 'bluetooth';
    const lan = mode === 'lan';
    tetherButton.setAttribute('aria-pressed',String(tether));
    directButton.setAttribute('aria-pressed', String(direct));
    photosButton.setAttribute('aria-pressed', String(photos));
    bluetoothButton.setAttribute('aria-pressed', String(bluetooth));
    lanButton.setAttribute('aria-pressed', String(lan));
    wpsButton.setAttribute('aria-pressed', String(mode === 'wps'));
    directGuide.hidden = !direct;
    tetherGuide.hidden=!tether;
    photosGuide.hidden = !photos;
    bluetoothGuide.hidden = !bluetooth;
    lanGuide.hidden = !lan;
    wpsGuide.hidden = mode !== 'wps';
    stopTetherTimer();if(tether){void refreshTether();tetherTimer=setInterval(()=>void refreshTether(),2500)}
    if(direct){refreshHandoffStatus();void refreshWifiLocation();void refreshWifiShutter();void updateLiveStatus()}
    if (bluetooth) void refreshBluetoothStatus();
  }
  async function refreshBluetoothStatus() {
    bluetoothResult.textContent = 'Reading the last local Bluetooth diagnostic…';
    try {
      const response = await fetch('/api/direct/ble/status', {cache:'no-store'});
      if (!response.ok) throw Error('Bluetooth status unavailable');
      const result = await response.json();
      if (result.running) {
        bluetoothResult.textContent = `Native diagnostic running: ${result.stage || 'unknown'} — ${result.detail || 'awaiting camera'}. Not yet paired.`;
      } else if (result.stage === 'authenticated') {
        bluetoothResult.textContent = 'A prior native test completed an authentication handshake, but closed that session. Camera control still needs its own active secure connection.';
      } else {
        bluetoothResult.textContent = `Latest native test: ${result.stage || 'not run'} — ${result.detail || 'No authenticated camera detected'}.`;
      }
    } catch {bluetoothResult.textContent = 'Could not read local diagnostic. Open FujiX Sync Direct Wi-Fi on this Mac.';}
  }
  function close() { stopPollingLive();stopTetherTimer();backdrop.hidden = true;trigger.focus(); }
  function open() { backdrop.hidden = false; dialog.focus(); refreshHandoffStatus();void refreshWifiLocation();void refreshWifiShutter(); }
  trigger.addEventListener('click', open);
  backdrop.querySelector('#fujix-wlan-close').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (!backdrop.hidden && e.key === 'Escape') close(); });
  directButton.addEventListener('click', () => setMode('direct'));
  tetherButton.addEventListener('click',()=>setMode('tether'));
  backdrop.querySelector('#fujix-wlan-tether-set-folder').addEventListener('click',configureTether);
  backdrop.querySelector('#fujix-wlan-tether-refresh').addEventListener('click',refreshTether);
  backdrop.querySelector('#fujix-wlan-tether-latest').addEventListener('click',()=>reviewTetherPhoto(tetherFiles[0]));
  backdrop.querySelector('#fujix-wlan-tether-save').addEventListener('click',saveTetherPhoto);
  directTransferStart.addEventListener('click',()=>setDirectTransfer(true));
  directTransferStop.addEventListener('click',()=>setDirectTransfer(false));
  backdrop.querySelector('#fujix-wlan-tether-download').addEventListener('click',()=>{
    if(tetherCurrent)window.location.href='/api/tether/files/'+tetherCurrent.id;
  });
  backdrop.querySelector('#fujix-wlan-refresh-handoff').addEventListener('click',refreshHandoffStatus);
  backdrop.querySelector('#fujix-wlan-location-allow').addEventListener('click',requestWifiLocation);
  backdrop.querySelector('#fujix-wlan-location-check').addEventListener('click',refreshWifiLocation);
  backdrop.querySelector('#fujix-wlan-go-wifi-activation').addEventListener('click',focusExistingHandoff);
  liveStart.addEventListener('click',startLive);
  liveStop.addEventListener('click',stopLive);
  photosButton.addEventListener('click', () => setMode('photos'));
  backdrop.querySelector('#fujix-wlan-photo-refresh').addEventListener('click',browseCameraPhotos);
  backdrop.querySelector('#fujix-wlan-photo-save').addEventListener('click',saveSelectedPhoto);
  backdrop.querySelector('#fujix-wlan-photo-download').addEventListener('click',downloadSelectedPhoto);
  backdrop.querySelector('#fujix-wlan-photo-import').addEventListener('click',()=>photoPicker.click());
  photoPicker.addEventListener('change',async()=>{
    const files=Array.from(photoPicker.files||[]);photoPicker.value='';let saved=0;
    for(const file of files){if(!allowedPhoto(file.name)||file.size>128*1024*1024)continue;
      try{await storeLibraryPhoto(file.name,file);saved++}catch(error){photoStatus.textContent=error.message||'File import failed';break}
    }
    if(saved)photoStatus.textContent=`Imported ${saved} original file${saved===1?'':'s'} into FujiX Sync Library. Click Library → Saved Photos → Refresh.`;
  });
  bluetoothButton.addEventListener('click', () => setMode('bluetooth'));
  lanButton.addEventListener('click', () => setMode('lan'));
  wpsButton.addEventListener('click', () => setMode('wps'));
  backdrop.querySelector('#fujix-wlan-refresh-bt').addEventListener('click', refreshBluetoothStatus);
  wifiShutterButton.addEventListener('click',async()=>{
    wifiShutterButton.disabled=true;
    if(!window.confirm('Send ONE experimental Wi-Fi shutter command to the verified X100VI? This may fail on your firmware; no photo is guaranteed.')){void refreshWifiShutter();return;}
    wifiShutterStatus.textContent='Sending one capture request through the active native X100VI PTP/IP session…';
    try{
      const response=await fetch('/api/direct/shutter',{method:'POST'});
      const result=await response.json();
      wifiShutterStatus.textContent=result.detail||'No camera response. A photo has not been verified.';
    }catch{wifiShutterStatus.textContent='The camera did not confirm the command. Do not assume a photo was captured.';}
    finally {wifiShutterButton.disabled=true;}
  });
  backdrop.querySelector('#fujix-wlan-open-bt-settings').addEventListener('click', async () => {
    const button = backdrop.querySelector('#fujix-wlan-open-bt-settings');
    button.disabled = true;
    try {
      const response = await fetch('/api/direct/ble/open-settings', {method:'POST'});
      if (!response.ok) throw Error('macOS Settings could not be opened');
      bluetoothResult.textContent = 'Mac Bluetooth settings opened. Select X100VI there and approve any pairing prompts. Pairing is not yet verified.';
    } catch {bluetoothResult.textContent = 'Open macOS System Settings → Bluetooth manually, then select X100VI.';}
    finally { button.disabled = false; }
  });
  backdrop.querySelector('#fujix-wlan-lan-check').addEventListener('click', async () => {
    const button = backdrop.querySelector('#fujix-wlan-lan-check');
    const result = backdrop.querySelector('#fujix-wlan-lan-result');
    const cameraIp = backdrop.querySelector('#fujix-wlan-camera-ip').value.trim();
    button.disabled = true;
    result.textContent = 'Checking the specified local camera address…';
    try {
      const response = await fetch('/api/direct/lan/check?cameraIp=' + encodeURIComponent(cameraIp), { cache: 'no-store' });
      const data = await response.json();
      result.textContent = data.error || data.note || 'Local camera port check finished.';
    } catch {
      result.textContent = 'Could not reach the FujiX Sync local bridge.';
    } finally { button.disabled = false; }
  });
  let lanBusy=false;
  const lanIdent=backdrop.querySelector('#fujix-wlan-lan-identify');
  const lanStart=backdrop.querySelector('#fujix-wlan-lan-start');
  const lanStop=backdrop.querySelector('#fujix-wlan-lan-stop');
  const lanStatus=backdrop.querySelector('#fujix-wlan-lan-transfer-status');
  async function refreshLan(){
    if(lanBusy)return;
    try{
      const response=await fetch('/api/direct/lan/status',{cache:'no-store'});
      if(!response.ok)throw Error('Mac LAN camera service unavailable');
      const data=await response.json();
      lanStart.disabled=!data.identityReported||data.autoTransfer?.active;
      lanStop.disabled=!data.autoTransfer?.active;
      lanStatus.textContent=data.autoTransfer?.active
        ? `Monitoring ${data.cameraIp} every ${data.autoTransfer.pollSeconds}s. Received ${data.autoTransfer.imported} full original(s). ${data.autoTransfer.error||'Waiting for a new camera SD file; transfer not assumed until bytes arrive.'}`
        : data.identityReported
          ? `X100VI PTP/IP identity reported by ${data.cameraIp}. You can now try the native gallery monitor; photo transfer is not verified until an original arrives.`
          : `${data.lastError||'No camera identified on the home Wi-Fi yet.'} This is not Frame.io upload redirection.`;
    }catch(e){lanStart.disabled=true;lanStop.disabled=true;lanStatus.textContent=e.message}
  }
  lanIdent.addEventListener('click',async()=>{
    if(lanBusy)return;lanBusy=true;lanIdent.disabled=true;lanStart.disabled=true;
    const cameraIp=backdrop.querySelector('#fujix-wlan-camera-ip').value.trim();
    lanStatus.textContent='Checking Fujifilm protocol identity at the specified camera IP. The Mac Wi-Fi remains unchanged…';
    try{
      const response=await fetch('/api/direct/lan/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cameraIp})});
      const data=await response.json();
      lanStatus.textContent=response.ok
        ? `X100VI protocol identification succeeded for ${cameraIp}. Click Start automatic local RAW/JPEG transfer to check gallery compatibility.`
        : data.error||'Camera did not respond to the Fujifilm identity handshake.';
    }catch(e){lanStatus.textContent=e.message||'Native camera identification failed'}
    finally{lanBusy=false;lanIdent.disabled=false;await refreshLan()}
  });
  async function lanCommand(action){
    if(lanBusy)return;lanBusy=true;lanStart.disabled=true;lanStop.disabled=true;
    lanStatus.textContent=action==='start'?'Verifying camera gallery and recording existing SD photos as a baseline…':'Stopping home-router original transfer monitoring…';
    try{
      const response=await fetch('/api/direct/lan/auto-transfer/'+action,{method:'POST'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Camera gallery was unavailable');
      lanStatus.textContent=action==='start'?'Home-router monitor started. Full files will be saved only if the camera reports new objects.':'LAN gallery monitor stopped.';
    }catch(e){lanStatus.textContent=e.message||'Camera operation failed'}
    finally{lanBusy=false;await refreshLan()}
  }
  lanStart.addEventListener('click',()=>void lanCommand('start'));
  lanStop.addEventListener('click',()=>void lanCommand('stop'));
  setInterval(()=>{if(!backdrop.hidden&&!lanGuide.hidden)void refreshLan()},7000);
  checkButton.addEventListener('click', async () => {
    checkButton.disabled = true;
    statusText.textContent = 'Checking this Mac’s connection to the camera network…';
    try {
      const response = await fetch('/api/direct/check', {cache:'no-store'});
      if (!response.ok) throw Error('Local camera bridge unavailable');
      const result = await response.json();
      const n = result.network || {};
      const local = n.localIp ? `Mac IP ${n.localIp}. ` : 'Mac Wi-Fi IP unavailable. ';
      statusText.textContent = n.inCameraSubnet
        ? (n.ptpReachable ? `${local}Camera-protocol port responds, but physical X100VI identity and live view are not yet verified.` : `${local}Camera-like subnet detected; Fujifilm PTP/IP port is not responding.`)
        : `${local}Mac is not on the expected X100VI direct hotspot subnet. This does not indicate whether router WPS registration succeeded.`;
    } catch {
      statusText.textContent = 'Unable to check the local camera bridge. Start FujiX Sync Direct Wi-Fi on this Mac.';
    } finally { checkButton.disabled = false; }
  });
})();
