/**
 * Supported X100VI Mac workflows. UI for explicit, read-only card imports,
 * portable local recipe backups, and the existing UVC video adapter.
 * No shutter commands, camera writes or undocumented firmware features.
 */
if (typeof document!=='undefined' && ['127.0.0.1','localhost'].includes(location.hostname)) {
  const style=document.createElement('style');
  style.textContent=[
   '.fx-supported{padding:16px 20px;border-bottom:1px solid #303944;background:#14191d;color:#e4edf5;font:12px/1.55 system-ui,sans-serif}',
   '.fx-supported h3{margin:0 0 5px;font-size:15px;color:#e5edf9}',
   '.fx-supported p{margin:5px 0 11px;color:#a3b2c3}',
   '.fx-supported .fx-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}',
   '.fx-supported button,.fx-supported select,.fx-supported .fx-export-link{font:600 12px system-ui,sans-serif;background:#20384d;border:1px solid #4c718c;border-radius:8px;color:#d9f3ff;padding:9px 11px;cursor:pointer;text-decoration:none;max-width:100%}',
   '.fx-supported button:disabled{opacity:.45;cursor:not-allowed}',
   '.fx-supported .fx-list{max-height:145px;overflow:auto;margin-top:10px;padding:7px;border:1px solid #354150;border-radius:8px}',
   '.fx-supported .fx-list label{display:flex;gap:7px;align-items:center;margin:4px 0;color:#c8d6e6;overflow:hidden}',
   '.fx-supported .fx-list span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
   '.fx-supported .fx-status{font-size:11px;min-height:16px;color:#8ad3f2}',
   '.fx-supported details{margin:12px 0 0}',
   '.fx-supported summary{cursor:pointer;color:#c3eaff;font-weight:600}',
   '#fx-supported-recipe-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:9px 0 5px}',
   '#fx-supported-recipe-actions button,#fx-supported-recipe-actions a{font-size:12px;background:#18364b;color:#c0eeff;padding:8px 12px;border:1px solid #4f768a;border-radius:8px;cursor:pointer;text-decoration:none}',
   '#fx-supported-recipe-actions .fx-status{font-size:11px;color:#80c4df;min-height:17px}',
   '#fx-recipe-backup-modal[hidden]{display:none!important}',
   '#fx-photo-audit-modal[hidden]{display:none!important}',
   '#fx-recipe-backup-modal{position:fixed;inset:0;z-index:2147483200;display:grid;place-items:center;padding:20px;background:#000c}',
   '#fx-photo-audit-modal{position:fixed;inset:0;z-index:2147483200;display:grid;place-items:center;padding:20px;background:#000c}',
   '#fx-recipe-backup-modal .fx-recipe-backup-panel{width:min(570px,96vw);max-height:88vh;overflow:auto;background:#151b22;border:1px solid #486079;border-radius:15px;padding:22px;color:#e4e8ef;font:13px/1.6 system-ui}',
   '#fx-photo-audit-modal .fx-recipe-backup-panel{width:min(620px,96vw);max-height:88vh;overflow:auto;background:#151b22;border:1px solid #486079;border-radius:15px;padding:22px;color:#e4e8ef;font:13px/1.6 system-ui}',
   '#fx-recipe-backup-modal h2{font-size:20px;margin:0 0 9px}',
   '#fx-photo-audit-modal h2{font-size:20px;margin:0 0 9px}',
   '#fx-recipe-backup-modal p{font-size:12px;color:#aebdcb;margin:8px 0 14px}',
   '#fx-photo-audit-modal p{font-size:12px;color:#aebdcb;margin:8px 0 14px}',
   '#fx-photo-audit-modal .fx-audit-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
   '#fx-photo-audit-modal button,#fx-photo-audit-modal .fx-audit-download{background:#20384d;color:#dbf2ff;padding:8px 12px;border:1px solid #486079;border-radius:8px;font:600 12px system-ui;cursor:pointer;text-decoration:none}',
   '#fx-photo-audit-modal button:disabled{opacity:.45;cursor:not-allowed}',
   '#fx-photo-audit-modal pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 monospace;max-height:180px;overflow:auto;color:#a7c5d3}',
   '#fx-recipe-backup-modal .fx-backup-close{float:right;border:1px solid #607184;background:#293744;border-radius:7px;padding:8px 12px;color:#f3f6fa;cursor:pointer}',
  ].join('');
  document.head.append(style);
  const request=async (url,body) => {
   const response=await fetch(url,{
    ...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
    cache:'no-store',
   });
   let data;
   try{data=await response.json()}catch{throw Error('FujiX Sync returned an unreadable response.')}
   if(!response.ok)throw Error(data?.error||'FujiX Sync workflow request failed.');
   return data;
  };
  const fileSize=bytes=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
  const create=(tag,{text='',className='',id=''}={})=>{
   const item=document.createElement(tag);
   if(text)item.textContent=text;
   if(className)item.className=className;
   if(id)item.id=id;
   return item;
  };
  let selectedFiles=[];
  let busy=false;
  const card=create('section',{className:'fx-supported',id:'fx-supported-card-reader'});
  card.append(create('h3',{text:'Import camera originals from SD card'}));
  card.append(create('p',{text:'In the X100VI menu choose USB CARD READER, connect USB-C, or insert the SD card into a Mac reader. Scan a mounted DCIM card and copy its existing JPEG/RAF files. Nothing on the card is changed.'}));
  const row=create('div',{className:'fx-actions'});
  const select=create('select',{id:'fx-supported-card-select'});select.setAttribute('aria-label','External SD card volume');
  const refresh=create('button',{text:'Find cards'});refresh.type='button';
  const scan=create('button',{text:'Scan DCIM'});scan.type='button';
  const importBtn=create('button',{text:'Import selected originals'});importBtn.type='button';importBtn.disabled=true;
  const openImageCapture=create('button',{text:'Open Image Capture'});
  openImageCapture.type='button';openImageCapture.hidden=true;
  const ptpScan=create('button',{text:'Scan USB camera photos (PTP)'});
  ptpScan.type='button';ptpScan.hidden=true;
  row.append(select,refresh,scan,importBtn,openImageCapture,ptpScan);card.append(row);
  const info=create('p',{className:'fx-status'});info.setAttribute('role','status');card.append(info);
  const listing=create('div',{className:'fx-list'});listing.hidden=true;card.append(listing);
  const ptpInfo=create('p',{className:'fx-status'});ptpInfo.setAttribute('role','status');card.append(ptpInfo);
  const ptpListing=create('div',{className:'fx-list'});ptpListing.hidden=true;card.append(ptpListing);
  const ptpImportControls=create('div',{className:'fx-actions'});
  const ptpImportBtn=create('button',{text:'Import selected USB originals (max 10)'});
  ptpImportBtn.type='button';ptpImportBtn.disabled=true;ptpImportBtn.hidden=true;
  const ptpStopBtn=create('button',{text:'Stop after current file'});
  ptpStopBtn.type='button';ptpStopBtn.disabled=true;ptpStopBtn.hidden=true;
  ptpImportControls.append(ptpImportBtn,ptpStopBtn);card.append(ptpImportControls);
  const ptpImportInfo=create('p',{className:'fx-status'});
  ptpImportInfo.setAttribute('role','status');card.append(ptpImportInfo);
  const instructions=create('details');
  const summary=create('summary',{text:'What if no card appears?'});instructions.append(summary);
  instructions.append(create('p',{text:'Some macOS Image Capture/PTP connections do not mount as a Finder drive. In that case, import existing files using “Import RAF/JPEG originals” above after copying them to the Mac with Image Capture. USB WEBCAM must be stopped before using USB CARD READER.'}));
  card.append(instructions);
  const usbConnectionRow=create('div',{className:'fx-actions'});
  const checkUsbConnection=create('button',{text:'Check USB camera connection'});
  checkUsbConnection.type='button';
  const usbConnectionStatus=create('p',{className:'fx-status'});
  usbConnectionStatus.setAttribute('role','status');
  usbConnectionRow.append(checkUsbConnection);
  card.append(usbConnectionRow,usbConnectionStatus);
  checkUsbConnection.addEventListener('click',async()=>{
    checkUsbConnection.disabled=true;
    usbConnectionStatus.textContent='Checking physical USB ports on the Mac running this FujiX Sync server…';
    try{
      const status=await request('/api/direct/usb/ptp/status');
      usbConnectionStatus.textContent=status.detected
        ? 'Fujifilm USB PTP camera detected on this Mac (04CB:0305). This proves cable/USB enumeration only, not photographic shutter or SD-card access. Use USB CARD READER mode for photo imports or USB WEBCAM for live video.'
        :status.available
          ? 'No Fujifilm PTP camera detected on this Mac. If the camera is connected to a different Mac, this server cannot access that USB cable over SSH. Connect the camera to the Mac running this server, or use FujiX Sync on the camera-connected Mac.'
          : 'Mac USB enumeration unavailable. Check the USB-C cable, power, connection mode and Mac permissions.';
    }catch(error){usbConnectionStatus.textContent=error.message}
    finally{checkUsbConnection.disabled=false}
  });
  const setBusy=state=>{busy=state;for(const x of [refresh,scan,importBtn,select])x.disabled=state;importBtn.disabled=state||!selectedFiles.length;};
  openImageCapture.addEventListener('click',async()=>{
    openImageCapture.disabled=true;
    try{
      await request('/api/usb/card-reader/open-image-capture',{});
      info.textContent='Opened macOS Image Capture on this Mac. Select X100VI from Devices, choose specific photos and use its Import control to save originals locally. The SD card stays unchanged. Then use FujiX Sync’s original-file import to add them to the library.';
    }catch(error){info.textContent=error.message}
    finally{openImageCapture.disabled=false}
  });
  let ptpCatalogTimer=null,ptpImportTimer=null,ptpRenderedAt=null;
  let selectedPtpIds=[];
  let lastImportJob=null;
  async function refreshPtpImport(){
    try{
      const job=await request('/api/usb/card-reader/ptp-import/status');
      const active=job.running===true;
      lastImportJob=job;
      ptpStopBtn.hidden=job.state==='idle';ptpStopBtn.disabled=!active||job.cancelRequested;
      ptpImportBtn.disabled=active||!selectedPtpIds.length;
      ptpScan.disabled=active;
      const finished=job.imported+job.duplicates+job.failed;
      ptpImportInfo.textContent=active
        ? 'Importing '+(finished+1)+' of '+job.items.length+' selected originals. Already archived: '+job.imported+
          ', exact SHA-256 duplicates skipped: '+job.duplicates+'. Camera files cannot be deleted.'
        :job.state==='completed'||job.state==='cancelled'
          ? 'Selected USB import '+job.state+': '+job.imported+' newly archived, '+job.duplicates+
            ' existing SHA-256 duplicates skipped. '+(job.state==='cancelled'?'Stopped between files.':'')+
            ' Camera originals preserved.'
          :job.state==='error'
            ? 'Selected USB import stopped: '+job.error+' ('+job.imported+' imported, '+job.duplicates+' duplicates skipped). Camera files preserved.'
            : '';
      if(job.state==='error'&&job.items.some(x=>x.status==='error')){
        ptpImportInfo.textContent+=' Failed item: '+job.items.find(x=>x.status==='error').name+'.';
      }
      if(!active&&ptpImportTimer){clearInterval(ptpImportTimer);ptpImportTimer=null;
        if(job.imported){document.querySelector('#fujix-mac-photo-refresh')?.click()}
      }
      if(active&&!ptpImportTimer)ptpImportTimer=setInterval(()=>void refreshPtpImport(),1300);
    }catch(error){ptpImportInfo.textContent=error.message}
  }
  async function refreshPtpCatalog(){
    try{
      const result=await request('/api/usb/card-reader/ptp-catalog/status');
      ptpScan.disabled=result.running||lastImportJob?.running===true;
      ptpInfo.textContent=result.running
        ? 'Reading camera file names through macOS Image Capture in a graphical Terminal session. No photos are being downloaded.'
        :result.state==='completed'
          ? 'Camera catalog: '+result.count+' JPEG/RAF files ('+result.jpeg+' JPEG, '+result.raf+' RAW). Choose up to 10 unique files, then import directly into the FujiX library. Filenames and sizes are rechecked before every transfer.'
          :result.state==='error'
            ? 'Camera catalog unavailable: '+result.error
            : '';
      if(result.state==='completed'&&ptpRenderedAt!==result.completedAt){
        ptpRenderedAt=result.completedAt;selectedPtpIds=[];
        ptpListing.replaceChildren();
        const uniqueness=new Map();
        for(const file of result.files){
          const key=file.name+'|'+file.format+'|'+file.bytes;
          uniqueness.set(key,(uniqueness.get(key)||0)+1);
        }
        for(const file of result.files){
          if(!/^[a-f0-9]{32}$/.test(file.id))continue;
          const label=create('label');
          const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=file.id;
          checkbox.disabled=uniqueness.get(file.name+'|'+file.format+'|'+file.bytes)!==1;
          const description=file.name+' · '+file.format+' · '+fileSize(file.bytes)+
            (checkbox.disabled?' · ambiguous; use Image Capture':'');
          label.append(checkbox,create('span',{text:description}));
          ptpListing.append(label);
        }
        ptpListing.hidden=result.files.length===0;
        ptpImportBtn.hidden=result.files.length===0;
        ptpImportBtn.disabled=true;
      }
      if(!result.running&&ptpCatalogTimer){clearInterval(ptpCatalogTimer);ptpCatalogTimer=null}
    }catch(error){ptpInfo.textContent=error.message;if(ptpCatalogTimer){clearInterval(ptpCatalogTimer);ptpCatalogTimer=null}}
  }
  ptpListing.addEventListener('change',()=>{
    const checked=[...ptpListing.querySelectorAll('input:checked')];
    if(checked.length>10){checked.at(-1).checked=false}
    selectedPtpIds=[...ptpListing.querySelectorAll('input:checked')].map(x=>x.value);
    ptpImportBtn.disabled=!selectedPtpIds.length||lastImportJob?.running===true;
  });
  ptpImportBtn.addEventListener('click',async()=>{
    if(lastImportJob?.running||!selectedPtpIds.length)return;
    if(!window.confirm('Copy '+selectedPtpIds.length+' selected X100VI JPEG/RAF original(s) to FujiX Sync on this Mac? Exact matches and SHA-256 duplicates are checked; nothing on the camera will be changed or deleted.'))return;
    ptpImportBtn.disabled=true;
    ptpImportInfo.textContent='Launching native selected-file import in a macOS graphical session…';
    try{
      await request('/api/usb/card-reader/ptp-import/start',{confirm:true,ids:selectedPtpIds});
      ptpListing.querySelectorAll('input:checked').forEach(el=>el.checked=false);
      selectedPtpIds=[];
      await refreshPtpImport();
    }catch(error){ptpImportInfo.textContent=error.message;ptpImportBtn.disabled=!selectedPtpIds.length}
  });
  ptpStopBtn.addEventListener('click',async()=>{
    try{await request('/api/usb/card-reader/ptp-import/cancel',{confirm:true});
      ptpImportInfo.textContent='Requested stop after the current file completes. Camera originals will not be modified.';
      await refreshPtpImport();
    }catch(error){ptpImportInfo.textContent=error.message}
  });
  ptpScan.addEventListener('click',async()=>{
    if(!window.confirm('List the existing filenames and sizes on the connected X100VI? This reads camera metadata only; nothing will be downloaded, changed or deleted.'))return;
    ptpScan.disabled=true;ptpListing.hidden=true;ptpInfo.textContent='Opening read-only Image Capture catalog on this Mac…';
    try{
      await request('/api/usb/card-reader/ptp-catalog/start',{confirm:true});
      await refreshPtpCatalog();
      if(!ptpCatalogTimer)ptpCatalogTimer=setInterval(()=>void refreshPtpCatalog(),1200);
    }catch(error){ptpInfo.textContent=error.message;ptpScan.disabled=false}
  });
  async function cards(){
   if(busy)return;setBusy(true);info.textContent='Looking for external DCIM volumes…';
   try{
    const data=await request('/api/usb/card-reader/mounts');
    select.replaceChildren();select.append(new Option('Choose mounted SD card…',''));
    for(const mount of data.mounts||[])select.append(new Option(mount.name,mount.name));
    if(data.selected && [...select.options].some(x=>x.value===data.selected))select.value=data.selected;
    openImageCapture.hidden=true;ptpScan.hidden=true;
    if(data.mounts?.length)info.textContent='Select a mounted camera card, then Scan DCIM.';
    else{
      let detected=false;
      try{const device=await request('/api/direct/usb/ptp/status');detected=device.detected===true}catch{}
      openImageCapture.hidden=!detected;
      ptpScan.hidden=!detected;
      if(detected){void refreshPtpCatalog();void refreshPtpImport()}
      info.textContent=detected
        ? 'Fujifilm USB PTP camera detected on this Mac, but no DCIM drive is mounted. Image Capture may list the existing camera photos without a Finder drive. A removable SD reader is another option; nothing has been imported.'
        : 'No external DCIM card is mounted. Insert an SD reader, or reconnect a powered-on X100VI in USB CARD READER mode.';
    }
   }catch(error){info.textContent=error.message}
   finally{setBusy(false)}
  }
  async function scanCard(){
   if(busy)return;
   if(!select.value){info.textContent='Choose a mounted SD card first.';return}
   setBusy(true);listing.replaceChildren();selectedFiles=[];listing.hidden=true;
   try{
    await request('/api/usb/card-reader/select',{name:select.value});
    const data=await request('/api/usb/card-reader/scan',{});
    const files=data.files||[];
    for(const file of files.slice(0,100)){
     if(!/^[a-f0-9]{32}$/.test(file.id))continue;
     const label=create('label');const check=document.createElement('input');check.type='checkbox';check.value=file.id;
     const span=create('span',{text:file.relative+' · '+fileSize(file.bytes)});
     label.append(check,span);listing.append(label);
    }
    listing.hidden=files.length===0;
    const shown=Math.min(files.length,100);
    info.textContent=files.length?('Found '+files.length+' JPEG/RAF originals; showing '+shown+'. Select up to 100 for import.'):'No JPEG/RAF originals found in DCIM.';
    if(data.truncated)info.textContent+=' Scan limit reached.';
   }catch(error){info.textContent=error.message}
   finally{setBusy(false)}
  }
  listing.addEventListener('change',()=>{
   selectedFiles=[...listing.querySelectorAll('input:checked')].map(x=>x.value).slice(0,100);
   importBtn.disabled=busy||selectedFiles.length===0;
  });
  async function importSelected(){
   if(busy||!selectedFiles.length)return;
   if(!window.confirm('Copy '+selectedFiles.length+' existing JPEG/RAF originals from the selected SD card into Mac Pictures? The SD card will not be modified.'))return;
   setBusy(true);info.textContent='Copying originals read-only, verifying file hashes…';
   try{
    const result=await request('/api/usb/card-reader/import',{ids:selectedFiles,confirm:true});
    info.textContent='Imported '+result.imported+' original(s); skipped '+result.skipped+' duplicate(s). Camera and SD card unchanged.';
    selectedFiles=[];listing.querySelectorAll('input').forEach(x=>x.checked=false);
    const originalRefresh=document.querySelector('#fujix-mac-photo-refresh');originalRefresh?.click();
   }catch(error){info.textContent=error.message}
   finally{setBusy(false)}
  }
  refresh.addEventListener('click',()=>void cards());scan.addEventListener('click',()=>void scanCard());
  importBtn.addEventListener('click',()=>void importSelected());
  const webcam=create('section',{className:'fx-supported',id:'fx-supported-usb-webcam'});
  webcam.append(create('h3',{text:'USB webcam live view'}));
  webcam.append(create('p',{text:'Video-only preview through the supported USB WEBCAM mode. JPEG snapshots are webcam frames, not 40MP photographs or RAF files.'}));
  const webcamRow=create('div',{className:'fx-actions'});
  const checkWebcam=create('button',{text:'Check USB video'});checkWebcam.type='button';
  const startWebcam=create('button',{text:'Start X100VI live view'});startWebcam.type='button';
  webcamRow.append(checkWebcam,startWebcam);webcam.append(webcamRow);
  const webcamStatus=create('p',{className:'fx-status'});webcamStatus.setAttribute('role','status');webcam.append(webcamStatus);
  checkWebcam.addEventListener('click',async()=>{
   webcamStatus.textContent='Checking macOS USB camera enumeration…';
   try{const value=await request('/api/direct/usb/webcam/readiness');webcamStatus.textContent=value.connected
    ? 'X100VI USB video input detected. Start live view to verify actual video frames in the browser.'
    :value.status==='enumeration_unavailable'?'macOS camera enumeration unavailable. Check permissions and cable.':
    'X100VI USB WEBCAM not detected. Set USB WEBCAM mode, reconnect USB-C and retry.'}
   catch(e){webcamStatus.textContent=e.message}
  });
  startWebcam.addEventListener('click',()=>{
   const existing=document.querySelector('#fujix-usb-start');
   if(existing && !existing.disabled){existing.click();webcamStatus.textContent='Requested the existing FujiX Sync USB webcam adapter; check its live video status.'}
   else webcamStatus.textContent='Open the Library live-view panel, ensure USB WEBCAM is selected and the camera is connected, then retry.';
  });
  function mountCardAndWebcam(){
   const controls=document.querySelector('#fujix-mac-photo-controls');
   if(!controls||!controls.parentElement)return;
   const parent=controls.parentElement;
   if(card.parentElement!==parent)controls.insertAdjacentElement('afterend',card);
   if(webcam.parentElement!==parent)card.insertAdjacentElement('afterend',webcam);
  }
  const recipeControls=create('div',{id:'fx-supported-recipe-actions'});
  const exportLink=create('a',{text:'Export staged recipes'});exportLink.href='/api/recipe-hub/backup';
  exportLink.title='Back up locally staged recipes. The built-in 101 recipes remain in the app and are not modified.';
  exportLink.setAttribute('download','FujiX-Sync-Local-Recipes.json');
  const importRecipes=create('button',{text:'Restore staged recipes'});importRecipes.type='button';
  const recipeInfo=create('span',{className:'fx-status'});recipeInfo.setAttribute('role','status');
  const backupPicker=document.createElement('input');backupPicker.type='file';backupPicker.accept='.json,application/json';backupPicker.hidden=true;
  recipeControls.append(exportLink,importRecipes,recipeInfo,backupPicker);
  importRecipes.addEventListener('click',()=>backupPicker.click());
  backupPicker.addEventListener('change',async()=>{
   const file=backupPicker.files?.[0];backupPicker.value='';
   if(!file)return;
   if(file.size>2*1024*1024){recipeInfo.textContent='Backup is over the 2MB limit.';return}
   importRecipes.disabled=true;recipeInfo.textContent='Validating backup without changing your recipes…';
   try{
    const backup=JSON.parse(await file.text());
    const preview=await request('/api/recipe-hub/backup/restore',{backup,apply:false});
    if(!preview.added){recipeInfo.textContent='All '+preview.examined+' recipes are already present. No changes made.';return}
    const yes=window.confirm('Merge '+preview.added+' new recipe(s) into your Mac library? Existing recipes remain untouched; no camera settings will be changed.');
    if(!yes){recipeInfo.textContent='Restore canceled; no data changed.';return}
    const applied=await request('/api/recipe-hub/backup/restore',{backup,apply:true});
    recipeInfo.textContent='Restored '+applied.added+' recipes; '+applied.skipped.length+' duplicates skipped. Existing records preserved.';
   }catch(e){recipeInfo.textContent=e.message||'Invalid recipe backup.'}
   finally{importRecipes.disabled=false}
  });
  // Keep the original React Recipes screen untouched: it is the user's
  // canonical 101-recipe interface. Expose backup actions from Library Tools,
  // not as a second competing full-screen Recipe Hub.
  const recipeModal=create('section',{id:'fx-recipe-backup-modal'});
  recipeModal.hidden=true;
  recipeModal.setAttribute('role','dialog');
  recipeModal.setAttribute('aria-modal','true');
  recipeModal.setAttribute('aria-label','Backup staged film recipes');
  const recipePanel=create('div',{className:'fx-recipe-backup-panel'});
  const closeRecipe=create('button',{text:'Close',className:'fx-backup-close'});
  closeRecipe.type='button';
  recipePanel.append(closeRecipe,create('h2',{text:'Recipe Backup & Restore'}));
  recipePanel.append(create('p',{text:'Export your locally staged/custom film recipes or merge a saved JSON backup. FujiX Sync keeps its original 101 built-in recipes separately; this workflow never writes to the X100VI camera.'}));
  recipePanel.append(recipeControls);
  recipeModal.append(recipePanel);
  document.body.append(recipeModal);
  const openRecipe=create('button',{id:'fujix-recipes-backup-open',text:'Recipe Backups'});
  openRecipe.type='button';openRecipe.hidden=true;document.body.append(openRecipe);
  const closeBackup=()=>{recipeModal.hidden=true;openRecipe.focus()};
  openRecipe.addEventListener('click',()=>{recipeModal.hidden=false;closeRecipe.focus()});
  closeRecipe.addEventListener('click',closeBackup);
  recipeModal.addEventListener('click',event=>{if(event.target===recipeModal)closeBackup()});
  recipeModal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeBackup()}});
  // An independent read-only audit of local originals and webcam previews.
  // A report can be downloaded and later compared after another explicit
  // scan; it is NOT a camera-authenticity or physical-transfer certificate.
  const auditModal=create('section',{id:'fx-photo-audit-modal'});
  auditModal.hidden=true;
  auditModal.setAttribute('role','dialog');auditModal.setAttribute('aria-modal','true');
  auditModal.setAttribute('aria-label','Photo Archive Integrity');
  const auditPanel=create('div',{className:'fx-recipe-backup-panel'});
  const auditClose=create('button',{text:'Close'});auditClose.type='button';
  const auditTitle=create('h2',{text:'Photo Archive Integrity'});
  auditPanel.append(auditClose,auditTitle,create('p',{text:'Scan the local FujiX Sync photo archive read-only. Check JPEG/RAF and other imported image signatures, record SHA-256 checksums, and identify duplicate files. No photos are deleted or changed. Keep an exported audit report to compare against later scans.'}));
  const auditActions=create('div',{className:'fx-audit-actions'});
  const auditStart=create('button',{text:'Check local photo archive'});auditStart.type='button';
  const auditCancel=create('button',{text:'Cancel scan'});auditCancel.type='button';auditCancel.disabled=true;
  const auditDownload=create('a',{text:'Download audit receipt',className:'fx-audit-download'});
  auditDownload.href='/api/usb/photos/audit/export';auditDownload.download='FujiX-Photo-Archive-Audit.json';auditDownload.hidden=true;
  const auditCompare=create('button',{text:'Compare old receipt'});auditCompare.type='button';auditCompare.disabled=true;
  const auditFile=document.createElement('input');auditFile.type='file';auditFile.accept='.json,application/json';auditFile.hidden=true;
  auditActions.append(auditStart,auditCancel,auditDownload,auditCompare,auditFile);
  const auditInfo=create('p',{className:'fx-status'});auditInfo.setAttribute('role','status');
  const auditIssues=create('pre');auditIssues.hidden=true;
  auditPanel.append(auditActions,auditInfo,auditIssues,create('p',{text:'An audit checks local bytes at that moment, not whether a photo was actually taken by the X100VI. Incomplete or unrecognized files are reported rather than repaired.'}));
  auditModal.append(auditPanel);document.body.append(auditModal);
  const openAudit=create('button',{id:'fujix-photo-audit-open',text:'Photo Archive Integrity'});
  openAudit.type='button';openAudit.hidden=true;document.body.append(openAudit);
  let auditTimer=null,shownAuditAt=null;
  async function refreshAudit(){
    try{
      const job=await request('/api/usb/photos/audit/status');
      auditStart.disabled=job.running;auditCancel.disabled=!job.running;
      auditDownload.hidden=!job.reportAvailable;auditCompare.disabled=!job.reportAvailable||job.running;
      const summary=job.summary;
      auditInfo.textContent=job.running
        ? 'Checking '+job.scanned+' of '+job.found+' discovered photos, '+fileSize(job.bytesScanned)+' read. No files modified.'
        :summary
          ? 'Checked '+summary.scanned+' files; '+summary.valid+' structurally valid, '+summary.issues+' issue(s), '+summary.duplicates+' duplicate group(s). '+(summary.complete?'Scan completed.':'Partial scan: limit reached; do not treat as all-clear.')
          :job.detail;
      if(job.reportAvailable&&!job.running&&shownAuditAt!==job.completedAt){
        shownAuditAt=job.completedAt;
        const report=await request('/api/usb/photos/audit/export');
        const output=[...(report.issues||[]).slice(0,12).map(x=>x.savedName+': '+x.issue),
          ...(report.duplicates||[]).slice(0,8).map(x=>'Duplicate copies: '+x.files.map(f=>f.savedName).join(', '))];
        auditIssues.hidden=!output.length;
        auditIssues.textContent=output.join('\n')+(report.issues?.length>12?'\nMore issues are in the exported report.':'');
      }
      if(!job.running&&auditTimer){clearInterval(auditTimer);auditTimer=null}
    }catch(error){auditInfo.textContent=error.message}
  }
  auditStart.addEventListener('click',async()=>{
    if(!window.confirm('Read and hash local FujiX Sync photo files for an integrity report? The scan changes no photos or camera settings.'))return;
    auditStart.disabled=true;auditIssues.hidden=true;shownAuditAt=null;
    try{
      await request('/api/usb/photos/audit/start',{confirm:true});
      await refreshAudit();
      if(!auditTimer)auditTimer=setInterval(()=>void refreshAudit(),1100);
    }catch(error){auditInfo.textContent=error.message;auditStart.disabled=false}
  });
  auditCancel.addEventListener('click',async()=>{try{await request('/api/usb/photos/audit/cancel',{});await refreshAudit()}catch(error){auditInfo.textContent=error.message}});
  auditCompare.addEventListener('click',()=>auditFile.click());
  auditFile.addEventListener('change',async()=>{
    const file=auditFile.files?.[0];auditFile.value='';if(!file)return;
    if(file.size>512*1024){auditInfo.textContent='Audit receipt exceeds the 512 KB limit.';return}
    auditCompare.disabled=true;
    try{
      const receipt=JSON.parse(await file.text());
      const result=await request('/api/usb/photos/audit/compare',{receipt});
      auditInfo.textContent='Comparison: '+result.counts.unchanged+' unchanged, '+result.counts.changed+' changed, '+result.counts.missing+' missing, '+result.counts.added+' new. No files modified.';
      const difference=[...result.changed.map(x=>'Changed: '+x.savedName),...result.missing.map(x=>'Missing: '+x.savedName),...result.added.map(x=>'Added: '+x.savedName)];
      auditIssues.hidden=!difference.length;auditIssues.textContent=difference.slice(0,30).join('\n')+(difference.length>30?'\nMore differences omitted.':'');
    }catch(error){auditInfo.textContent=error.message}
    finally{auditCompare.disabled=false}
  });
  const closeAudit=()=>{auditModal.hidden=true;openAudit.focus()};
  openAudit.addEventListener('click',()=>{auditModal.hidden=false;void refreshAudit();auditClose.focus()});
  auditClose.addEventListener('click',closeAudit);
  auditModal.addEventListener('click',event=>{if(event.target===auditModal)closeAudit()});
  auditModal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeAudit()}});
  let mounted=false;
  function mount(){mountCardAndWebcam();if(!mounted&&card.isConnected){mounted=true;void cards();void checkWebcam.click()}}
  mount();
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.querySelector('#root')||document.body,{childList:true,subtree:true});
  window.addEventListener('popstate',mount);
}
