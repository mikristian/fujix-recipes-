/** FujiX Sync: honest local camera companion. Hardware actions are explicit. */
import {mountCameraPresets} from './filmkit-camera-manager.mjs';
if(['localhost','127.0.0.1'].includes(location.hostname)){
  const button=document.createElement('button');button.id='fujix-offline-open';button.type='button';button.textContent='Film Lab & Workflows';button.setAttribute('aria-haspopup','dialog');
  const overlay=document.createElement('div');overlay.id='fujix-offline-root';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','FujiX Sync offline film lab');
  overlay.innerHTML=`<div id="fujix-offline-card"><header><div><h2>FujiX Sync · Creative Studio</h2><p>Offline workflows do not change camera settings. The separate Camera USB panel requires a physical device, a verified backup, and explicit confirmation before a one-slot change. Firmware is never modified.</p></div><button id="fujix-offline-close" type="button">Close</button></header>
    <nav id="fujix-offline-tabs" aria-label="Creative Studio sections"><button type="button" data-panel="overview" aria-selected="true">Readiness</button><button type="button" data-panel="profiles" aria-selected="false">Film Profiles</button><button type="button" data-panel="usb-recipes" aria-selected="false">Camera USB · C1–C7</button><button type="button" data-panel="multishot" aria-selected="false">Multi-shot Studio</button></nav>
    <div id="fujix-offline-panels">
      <section data-panel="overview"><div id="fujix-offline-summary" class="fujix-offline-grid"><div class="fujix-offline-box">Checking local software and photo folders…</div></div>
      <h3>Workflows available without camera hardware</h3><div class="fujix-offline-actions"><button id="fujix-open-xraw" type="button">Open X RAW STUDIO</button><button id="fujix-open-obs" type="button">Open OBS</button><button id="fujix-offline-import" class="main" type="button">Import real RAF/JPEG files</button><button id="fujix-offline-refresh" type="button">Refresh status</button></div>
      <p id="fujix-offline-launch-status" class="fujix-offline-status" role="status"></p>
      <div class="fujix-offline-box"><strong>Read-only original image inspector</strong><p>Inspect RAF/JPEG/PNG headers and calculate source SHA-256. Image bytes alone cannot prove camera origin.</p>
      <div class="fujix-offline-actions"><select id="fujix-offline-image-select" aria-label="Choose imported original"><option value="">No imported originals loaded</option></select><button id="fujix-offline-image-inspect">Inspect selected original</button></div>
      <pre id="fujix-offline-image-report" class="fujix-offline-data" hidden></pre></div>
      <div class="fujix-offline-grid">
       <div class="fujix-offline-box"><strong>USB WEBCAM</strong><small>Moving video preview / JPEG snapshot, not photographic shutter or full-resolution RAW tether.</small></div>
       <div class="fujix-offline-box"><strong>USB CARD READER</strong><small>Transfer actual camera RAF/JPEG originals with Image Capture and the existing import function.</small></div>
       <div class="fujix-offline-box"><strong>USB RAW CONV./BACKUP RESTORE</strong><small>Camera-assisted image development in X RAW STUDIO when the real camera is connected. Do not use with USB WEBCAM.</small></div>
      </div></section>
      <section data-panel="profiles" hidden><h3>Film profile vault</h3><p>Build and back up your intended C1–C7 film settings offline. These are planning snapshots, <strong>not</strong> verified reads from your camera. For physical camera operations use the separate USB camera tab, which requires hardware validation and a verified backup.</p>
      <div class="fujix-offline-grid"><div class="fujix-offline-box"><strong>Save a C-slot locally</strong><div style="display:grid;gap:8px">
      <label for="fujix-profile-slot">Slot</label><select id="fujix-profile-slot">${['C1','C2','C3','C4','C5','C6','C7'].map(s=>`<option value="${s}">${s}</option>`).join('')}</select>
      <label for="fujix-profile-name">Recipe name</label><input id="fujix-profile-name" maxlength="100" placeholder="e.g. Golden Hour"/>
      <label for="fujix-profile-film">Base film simulation</label><input id="fujix-profile-film" maxlength="100" placeholder="e.g. Classic Chrome"/>
      <label for="fujix-profile-dr">Dynamic range</label><select id="fujix-profile-dr"><option value="">Not specified</option><option>DR100</option><option>DR200</option><option>DR400</option><option>AUTO</option></select>
      <label for="fujix-profile-notes">Notes / optional settings (manual)</label><textarea id="fujix-profile-notes" rows="3" maxlength="2000" placeholder="White balance, grain, highlights, shadows…"></textarea>
      <button type="button" class="main" id="fujix-profile-save">Save offline slot</button>
      </div></div><div class="fujix-offline-box"><strong>Existing FujiX recipe collection</strong><p>Use one of the 101 already archived PDF-source recipes as a draft. Source text has OCR/extraction artifacts, so review every field before using it.</p><select id="fujix-profile-catalog" style="max-width:100%"><option value="">Load 101 archived recipes…</option></select><div class="fujix-offline-actions"><button type="button" id="fujix-profile-use-catalog">Use as editable draft</button></div><p>This does not transfer anything into the camera.</p></div></div>
      <div class="fujix-offline-actions"><button id="fujix-profiles-refresh">View saved profile snapshots</button><button id="fujix-profiles-export">Export vault backup</button><button id="fujix-profiles-import">Import vault backup</button></div>
      <p id="fujix-profiles-status" class="fujix-offline-status" role="status">No camera needed.</p>
      <pre id="fujix-profiles-output" class="fujix-offline-data">Saved profiles will appear here.</pre>
      <input id="fujix-profiles-file" type="file" accept=".json,application/json" hidden>
      <p>These offline drafts remain separate from the physical camera. For direct camera access, open Camera USB · C1–C7.</p></section>
      <section data-panel="usb-recipes" hidden><div id="fujix-camera-presets-mount"></div></section>
      <section data-panel="multishot" hidden><h3>Multi-shot Studio</h3><p>Plan and organize film simulation brackets, focus stacks, exposure brackets and time-lapse sequences. Original files must be imported separately; no camera capture is implied.</p>
      <div class="fujix-offline-actions"><select id="fujix-multishot-mode" aria-label="Shooting sequence type"><option value="film-simulation">Film simulation bracket</option><option value="focus">Focus stack</option><option value="ae">Exposure bracket</option><option value="interval">Time lapse</option></select><button id="fujix-multishot-scan">Prepare draft from imported originals</button></div>
      <p>The manifest below is editable. Confirm each photo's actual capture time, bracket order and sequence count before analyzing. File import timestamps are <strong>not</strong> reliable exposure metadata.</p>
      <textarea id="fujix-multishot-manifest" rows="7" spellcheck="false" style="width:100%;font:11px/1.5 monospace" aria-label="Multishot JSON manifest">{"version":1,"sources":[]}</textarea>
      <div class="fujix-offline-actions"><button type="button" class="main" id="fujix-multishot-analyze">Analyze manifest</button><button type="button" id="fujix-multishot-project" disabled>Export project JSON</button><button type="button" id="fujix-multishot-sheet" disabled>Download contact index HTML</button></div>
      <div class="fujix-offline-box"><strong>Local JPEG/PNG time-lapse movie renderer</strong><p>Set sequence mode to Time lapse, review the source file order in the manifest, then render into the local FujiX Sync archive's Projects/TimeLapses folder (on the expansion drive when configured). RAF photos must be converted to JPEG first. Original source files remain untouched.</p>
      <div class="fujix-offline-actions"><label for="fujix-timelapse-fps">Frames/sec</label><input id="fujix-timelapse-fps" type="number" min="1" max="60" value="24" style="width:72px"><button type="button" class="main" id="fujix-timelapse-render">Render selected sequence</button><button type="button" id="fujix-timelapse-cancel">Cancel render</button><a id="fujix-timelapse-download" hidden download style="padding:10px;color:#74d2ff">Download finished MP4</a></div><p class="fujix-offline-status" id="fujix-timelapse-status" role="status">Requires at least two imported JPEG/PNG originals and an explicit render click.</p></div>
      <p class="fujix-offline-status" id="fujix-multishot-status" role="status">Waiting for a local library scan.</p><pre id="fujix-multishot-output" class="fujix-offline-data">Your imported originals are kept separate from USB webcam preview JPEGs.</pre></section>
    </div></div>`;
  document.body.append(button,overlay);
  mountCameraPresets(overlay);
  const $=selector=>overlay.querySelector(selector);
  const status=(id,message)=>{$(id).textContent=message};
  let catalog=[],lastProject=null,lastSheet=null;
  let renderPoll=null;
  async function api(path,init={}){
    const r=await fetch(path,{cache:'no-store',...init});
    const j=await r.json();if(!r.ok)throw Error(j.error||`Request failed: ${r.status}`);return j;
  }
  function box(title,detail){
    const element=document.createElement('div');element.className='fujix-offline-box';
    const heading=document.createElement('strong');heading.textContent=title;
    const small=document.createElement('small');small.textContent=detail;
    element.append(heading,small);return element;
  }
  async function readiness(){
    const summary=$('#fujix-offline-summary');summary.replaceChildren(box('Checking…','Looking for installed apps and real Mac photo files.'));
    try{
      const data=await api('/api/studio/readiness');
      summary.replaceChildren(
        box('RAF originals',String(data.library.rafCount)+' real file(s) in the local library'),
        box('Camera originals',String(data.library.originalCount)+' imported file(s); webcam previews excluded'),
        box('USB previews',String(data.library.usbPreviewCount)+' video JPEG(s)'),
        box('Originals incoming',String(data.library.incomingFileCount)+' unprocessed candidate file(s)'),
        box('X RAW STUDIO',data.installed.xRawStudio?'Installed on Mac':'Not installed'),
        box('X100VI camera',data.usbCamera.enumerated?'Enumerated in USB camera mode; live frames unverified':'Not detected as USB webcam right now')
      );
      $('#fujix-open-xraw').disabled=!data.installed.xRawStudio;
      $('#fujix-open-obs').disabled=!data.installed.obs;
      const imported=await api('/api/usb/photos');
      const selector=$('#fujix-offline-image-select');selector.replaceChildren(new Option('Select imported RAF/JPEG/PNG…',''));
      for(const f of (imported.files||[]).filter(f=>f.isOriginal && /\.(?:raf|jpe?g|png)$/i.test(f.name)))selector.add(new Option(f.name,f.id));
    }catch(error){summary.replaceChildren(box('Readiness check unavailable',error.message))}
  }
  async function launch(app){
    status('#fujix-offline-launch-status','Opening installed macOS application…');
    try{const reply=await api('/api/studio/open-app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app})});status('#fujix-offline-launch-status',reply.note)}
    catch(error){status('#fujix-offline-launch-status',error.message)}
  }
  async function profiles(){
    try{
      const d=await api('/api/studio/profiles');
      $('#fujix-profiles-output').textContent=JSON.stringify(d,null,2);
      const slot=d.slots?.[$('#fujix-profile-slot').value];
      if(slot){
        $('#fujix-profile-name').value=slot.name;
        $('#fujix-profile-film').value=slot.recipe.filmSimulation||'';
        $('#fujix-profile-dr').value=slot.recipe.dynamicRange||'';
        $('#fujix-profile-notes').value=slot.recipe.notes||'';
      }
      status('#fujix-profiles-status','Offline profile snapshots loaded. These do not read the camera.');
    }catch(error){status('#fujix-profiles-status','Profile snapshot service not ready: '+error.message)}
  }
  async function shots(){
    try{
      const data=await api('/api/usb/photos');
      const originals=(data.files||[]).filter(x=>x.isOriginal);
      const mode=$('#fujix-multishot-mode').value;
      const sources=originals.slice(0,100).reverse().map((x,i)=>({
        path:x.name,eventId:'MANUALLY-REVIEW-SHOOT',type:mode,captureTime:new Date(x.createdAt).toISOString(),
        sequenceIndex:i,expectedCount:originals.length,metadata:{note:'Mac import timestamp only; replace with actual exposure time before relying on grouping',localPhotoId:x.id}
      }));
      $('#fujix-multishot-manifest').value=JSON.stringify({version:1,sources},null,2);
      $('#fujix-multishot-output').textContent='Draft generated from '+sources.length+' existing library original(s). Fix captureTime, eventId, and expectedCount as needed; the draft has NOT been grouped or exported.';
      status('#fujix-multishot-status',`${originals.length} imported original(s). Draft uses import timestamps only. No files moved.`);
    }catch(error){status('#fujix-multishot-status',error.message)}
  }
  async function loadCatalog(){
    try{
      const response=await fetch('/recipes.json');if(!response.ok)throw Error('Recipe archive unavailable');
      const data=await response.json();catalog=(data.backups||[]).flatMap(b=>(b.slots||[]).map(s=>({...s,backupNumber:b.backupNumber})));
      const options=$('#fujix-profile-catalog');options.replaceChildren(new Option('Choose from '+catalog.length+' PDF-source recipes',''));
      catalog.forEach((recipe,i)=>options.add(new Option(`Backup ${recipe.backupNumber} C${recipe.slotNumber}: ${recipe.name}`,String(i))));
    }catch(error){status('#fujix-profiles-status','Could not load saved recipes: '+error.message)}
  }
  function saveJson(name,data){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  button.addEventListener('click',()=>{overlay.hidden=false;void readiness()});
  $('#fujix-offline-close').addEventListener('click',()=>{overlay.hidden=true;button.focus()});
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.hidden=true});
  document.addEventListener('keydown',e=>{if(!overlay.hidden&&e.key==='Escape'){overlay.hidden=true;button.focus()}});
  $('#fujix-offline-tabs').addEventListener('click',e=>{
    const tab=e.target.closest('button[data-panel]');if(!tab)return;
    for(const p of overlay.querySelectorAll('[data-panel]')){
      if(p.tagName==='BUTTON')p.setAttribute('aria-selected',String(p.dataset.panel===tab.dataset.panel));
      if(p.tagName==='SECTION')p.hidden=p.dataset.panel!==tab.dataset.panel;
    }
    if(tab.dataset.panel==='profiles'){void profiles();if(!catalog.length)void loadCatalog()}
  });
  $('#fujix-open-xraw').addEventListener('click',()=>void launch('xraw'));
  $('#fujix-open-obs').addEventListener('click',()=>void launch('obs'));
  $('#fujix-offline-refresh').addEventListener('click',()=>void readiness());
  $('#fujix-offline-image-inspect').addEventListener('click',async()=>{
    try{
      const id=$('#fujix-offline-image-select').value;
      if(!id)throw Error('Import and select an original RAF/JPEG/PNG file first.');
      status('#fujix-offline-launch-status','Inspecting image bytes, header and SHA-256 without modifying it…');
      const result=await api('/api/studio/image/inspect?id='+encodeURIComponent(id));
      $('#fujix-offline-image-report').hidden=false;
      $('#fujix-offline-image-report').textContent=JSON.stringify(result.inspection,null,2);
      status('#fujix-offline-launch-status','File inspection complete. Camera original provenance remains unverified.');
    }catch(error){status('#fujix-offline-launch-status',error.message)}
  });
  $('#fujix-offline-import').addEventListener('click',()=>{
    const importButton=document.querySelector('#fujix-mac-photo-import');
    if(importButton)importButton.click();
    else status('#fujix-offline-launch-status','Open Mac Photos in the Library tab, then use Import RAF/JPEG originals.');
  });
  $('#fujix-profiles-refresh').addEventListener('click',()=>void profiles());
  $('#fujix-profile-slot').addEventListener('change',()=>void profiles());
  $('#fujix-profile-save').addEventListener('click',async()=>{
    try{
      const name=$('#fujix-profile-name').value.trim(),film=$('#fujix-profile-film').value.trim(),notes=$('#fujix-profile-notes').value.trim();
      if(!name||!film)throw Error('Recipe name and base film simulation are required.');
      const recipe={filmSimulation:film};
      if($('#fujix-profile-dr').value)recipe.dynamicRange=$('#fujix-profile-dr').value;
      if(notes)recipe.notes=notes;
      const saved=await api('/api/studio/profiles/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot:$('#fujix-profile-slot').value,name,recipe})});
      status('#fujix-profiles-status',`Saved ${saved.snapshot.slot} to the Mac only (${saved.changes.length} changed field(s)). No camera settings touched.`);
      $('#fujix-profiles-output').textContent=JSON.stringify(await api('/api/studio/profiles'),null,2);
    }catch(error){status('#fujix-profiles-status',error.message)}
  });
  $('#fujix-profile-use-catalog').addEventListener('click',()=>{
    const selected=$('#fujix-profile-catalog').value;const recipe=selected===''?null:catalog[Number(selected)];
    if(!recipe){status('#fujix-profiles-status','Select an archived recipe first.');return}
    $('#fujix-profile-name').value=recipe.name.slice(0,100);
    const simulation=recipe.settings?.filmSimulation||'';
    $('#fujix-profile-film').value=simulation.length<=100?simulation:'';
    $('#fujix-profile-notes').value=(`PDF backup ${recipe.backupNumber}, C${recipe.slotNumber}. SOURCE (verify manually): ${recipe.rawText||JSON.stringify(recipe.settings)}`).slice(0,1990).replace(/[\r\n\t]/g,' ');
    status('#fujix-profiles-status','Loaded a PDF-source draft; many extracted fields are truncated. Review and correct before saving.');
  });
  $('#fujix-profiles-export').addEventListener('click',async()=>{
    try{saveJson('fujix-offline-profiles.json',await api('/api/studio/profiles'));status('#fujix-profiles-status','Saved a local planning snapshot JSON. No camera was changed.')}
    catch(error){status('#fujix-profiles-status',error.message)}
  });
  $('#fujix-profiles-import').addEventListener('click',()=>$('#fujix-profiles-file').click());
  $('#fujix-profiles-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>512000)throw Error('Profile JSON is too large.');
      const parsed=JSON.parse(await file.text());
      const preview=await api('/api/studio/profiles/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup:parsed,apply:false})});
      const changed=Object.values(preview.diff||{}).reduce((n,v)=>n+v.length,0);
      if(!window.confirm(`Valid backup. Replace this Mac's C1–C7 planning snapshots? ${changed} field changes. This will NOT change the camera.`)){
        status('#fujix-profiles-status','Import cancelled; current vault preserved.');return;
      }
      const result=await api('/api/studio/profiles/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup:parsed,apply:true})});
      status('#fujix-profiles-status',result.note||'Profile archive imported locally.');
      $('#fujix-profiles-output').textContent=JSON.stringify(await api('/api/studio/profiles'),null,2);
    }catch(error){status('#fujix-profiles-status',error.message)}
    finally{event.target.value=''}
  });
  $('#fujix-multishot-scan').addEventListener('click',()=>void shots());
  $('#fujix-multishot-analyze').addEventListener('click',async()=>{
    try{
      const manifest=JSON.parse($('#fujix-multishot-manifest').value);
      const result=await api('/api/studio/multishot/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifest)});
      lastProject=result.project;lastSheet=result.contactSheetHtml;
      $('#fujix-multishot-output').textContent=JSON.stringify(lastProject,null,2);
      $('#fujix-multishot-project').disabled=false;$('#fujix-multishot-sheet').disabled=false;
      const complete=lastProject.groups.filter(g=>g.complete).length;
      status('#fujix-multishot-status',`Analyzed ${lastProject.groups.length} sequence(s); ${complete} explicitly complete. Heuristic grouping requires visual review.`);
    }catch(error){lastProject=null;lastSheet=null;$('#fujix-multishot-project').disabled=true;$('#fujix-multishot-sheet').disabled=true;status('#fujix-multishot-status',error.message)}
  });
  $('#fujix-multishot-project').addEventListener('click',()=>{if(lastProject)saveJson('fujix-multishot-project.json',lastProject)});
  $('#fujix-multishot-sheet').addEventListener('click',()=>{
    if(!lastSheet)return;
    const url=URL.createObjectURL(new Blob([lastSheet],{type:'text/html'}));
    const a=document.createElement('a');a.href=url;a.download='fujix-multishot-contact-index.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  async function refreshTimelapse(){
    try{
      const job=await api('/api/studio/timelapse/status');
      const rendererAvailable=job.renderer?.available===true;
      status('#fujix-timelapse-status',!rendererAvailable&&!job.running?(job.renderer?.reason||'No local FFmpeg renderer is configured'):(job.detail||job.status));
      $('#fujix-timelapse-render').disabled=job.running||!rendererAvailable;
      $('#fujix-timelapse-cancel').disabled=!job.running;
      const link=$('#fujix-timelapse-download');link.hidden=!job.fileUrl;
      if(job.fileUrl)link.href=job.fileUrl;
      if(!job.running&&renderPoll){clearInterval(renderPoll);renderPoll=null}
    }catch(error){status('#fujix-timelapse-status',error.message)}
  }
  $('#fujix-timelapse-render').addEventListener('click',async()=>{
    try{
      const manifest=JSON.parse($('#fujix-multishot-manifest').value);
      const sources=manifest.sources||[];
      if($('#fujix-multishot-mode').value!=='interval'||sources.length<2||sources.some(x=>x.type!=='interval'))throw Error('Choose Time lapse and provide at least two interval-shot JPEG/PNG sources.');
      const sorted=[...sources].sort((a,b)=>(a.sequenceIndex??Number.MAX_SAFE_INTEGER)-(b.sequenceIndex??Number.MAX_SAFE_INTEGER));
      const ids=sorted.map(x=>x.metadata?.localPhotoId);
      if(ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id)))throw Error('Use Prepare draft from imported originals first. The camera file IDs must come from this Mac library.');
      const fps=Number($('#fujix-timelapse-fps').value);
      if(!window.confirm(`Render ${ids.length} imported still photographs at ${fps} fps to a NEW MP4? Source files will not be changed.`))return;
      const result=await api('/api/studio/timelapse/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,fps,confirm:true})});
      status('#fujix-timelapse-status',result.detail);
      await refreshTimelapse();
      if(!renderPoll)renderPoll=setInterval(()=>void refreshTimelapse(),1600);
    }catch(error){status('#fujix-timelapse-status',error.message)}
  });
  $('#fujix-timelapse-cancel').addEventListener('click',async()=>{
    try{await api('/api/studio/timelapse/stop',{method:'POST'});await refreshTimelapse()}
    catch(error){status('#fujix-timelapse-status',error.message)}
  });
  void refreshTimelapse();
  if(new URLSearchParams(location.search).get('studio')==='creative'){
    overlay.hidden=false;
    void readiness();
  }
}
