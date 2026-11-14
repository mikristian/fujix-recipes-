/** UI for the embedded FilmKit USB/PTP adapter. Every USB operation is a click. */
import {SIMULATIONS,X100viPresetBridge} from './filmkit-camera-bridge.mjs';

export function mountCameraPresets(overlay){
 const root=overlay.querySelector('#fujix-camera-presets-mount');
 if(!root)return;
 root.innerHTML=`<h3>Physical X100VI · USB camera recipes</h3>
  <p>Read camera C1–C7 recipes, back up their actual PTP property bytes to Jarvis, and test a single verified film simulation change. <strong>These operations access the connected camera.</strong> A seven-slot scan temporarily selects C1–C7 and restores your original camera slot.</p>
  <div class="fujix-offline-box"><strong>Camera setup</strong><ol><li>On the X100VI, select <b>Network/USB Setting → Connection Mode → USB RAW CONV./BACKUP RESTORE</b>, with USB communication enabled.</li><li>Connect the camera to this Mac with USB-C, turn it on, and close Image Capture or X RAW STUDIO.</li><li>Use Google Chrome and press <b>Connect X100VI</b>; approve the browser device picker.</li><li>Press <b>Read all 7 + save verified backup</b>. The one-slot write stays locked until disk verification succeeds.</li></ol>
  <p>Switching from USB CARD READER may interrupt FujiX Sync's photo-import session. No firmware change, remote shutter or live view is involved.</p></div>
  <div class="fujix-offline-actions"><button id="fujix-camera-connect" type="button">Connect X100VI (WebUSB)</button><button id="fujix-camera-read-backup" type="button" disabled>Read C1–C7 + save backup</button><button id="fujix-camera-disconnect" type="button" disabled>Disconnect USB session</button></div>
  <p id="fujix-camera-status" role="status" class="fujix-offline-status">Not connected. No physical camera recipe has been read or changed.</p>
  <div class="fujix-offline-box"><strong>One-slot film simulation test</strong><p>Only one two-byte FilmSimulation property (0xD192) will be changed. All other C-slot settings are checked against the saved backup, and a failed write triggers an attempted restoration. A backup does not guarantee recovery after unplug/power loss.</p>
   <div class="fujix-offline-actions"><label for="fujix-camera-slot">Camera slot</label><select id="fujix-camera-slot">${Array.from({length:7},(_,i)=>`<option value="${i+1}">C${i+1}</option>`).join('')}</select>
   <label for="fujix-camera-simulation">Film simulation</label><select id="fujix-camera-simulation">${SIMULATIONS.map(x=>`<option value="${x.code}">${x.label}</option>`).join('')}</select></div>
   <p id="fujix-camera-current">Connect and save the camera's seven slots first.</p>
   <button type="button" class="main" id="fujix-camera-write-test" disabled>Test one C-slot change + read back</button>
  </div>
  <div class="fujix-offline-actions"><button type="button" id="fujix-camera-export" disabled>Download readable camera backup JSON</button></div>
  <pre class="fujix-offline-data" id="fujix-camera-output">No camera-backed C1–C7 data yet.</pre>
  <pre class="fujix-offline-data" id="fujix-camera-log" style="max-height:120px" aria-label="X100VI USB operation log"></pre>`;
 const $=selector=>root.querySelector(selector);
 const bridge=new X100viPresetBridge(message=>{
  const log=$('#fujix-camera-log');log.textContent=(log.textContent+'\n'+new Date().toLocaleTimeString()+' '+message).slice(-6000);
 });
 let running=false;
 const tell=msg=>{$('#fujix-camera-status').textContent=msg};
 const code=(slot)=>{
  const prop=bridge.current?.slots[slot-1]?.properties?.find(x=>x.id===0xD192);
  return prop?parseInt(prop.hex.slice(2)+prop.hex.slice(0,2),16):null;
 };
 function sync(){
  const saved=Boolean(bridge.current&&bridge.backup),connected=bridge.connected;
  $('#fujix-camera-connect').disabled=running||connected;
  $('#fujix-camera-read-backup').disabled=running||!connected;
  $('#fujix-camera-disconnect').disabled=running||!connected;
  $('#fujix-camera-write-test').disabled=running||!saved||!connected;
  $('#fujix-camera-export').disabled=running||!saved;
  const slot=Number($('#fujix-camera-slot').value),c=code(slot);
  const name=bridge.current?.slots[slot-1]?.name||'Not read';
  const sim=SIMULATIONS.find(x=>x.code===c)?.label||(c===null?'Not read':'Unrecognized code '+c);
  $('#fujix-camera-current').textContent=`C${slot}: ${name} · current film simulation: ${sim}.`;
 }
 const act=async(fn)=>{
  if(running)return;
  running=true;sync();
  try{await fn()}catch(error){tell('Operation stopped: '+(error?.message||String(error)))}finally{running=false;sync()}
 };
 $('#fujix-camera-connect').addEventListener('click',()=>void act(async()=>{
  if(!navigator.usb)throw Error('Use Chrome on localhost; this browser does not support WebUSB.');
  // User activation passes straight through to FilmKit's requestDevice().
  const identity=await bridge.connect();
  tell(`USB connected: ${identity.model}, firmware ${identity.firmware}. Read all seven presets and archive a verified backup next.`);
 }));
 $('#fujix-camera-read-backup').addEventListener('click',()=>void act(async()=>{
  tell('Reading all C1–C7 slots. Camera selector will be restored; do not unplug USB.');
  const result=await bridge.scanAndBackup();
  $('#fujix-camera-output').textContent=JSON.stringify({camera:result.snapshot.camera,capturedAt:result.snapshot.capturedAt,receipt:result.receipt,slots:result.snapshot.slots.map(s=>({slot:'C'+s.slot,name:s.name,filmSimulationCode:code(s.slot),propertiesRead:s.properties.length}))},null,2);
  const current=code(Number($('#fujix-camera-slot').value));
  if(current!==null)$('#fujix-camera-simulation').value=String(current);
  tell(`All 7 camera slots saved to Mac and verified with SHA-256. Backup ID: ${result.receipt.id}. Now select ONE slot and a new simulation for a reversible test.`);
 }));
 $('#fujix-camera-disconnect').addEventListener('click',()=>void act(async()=>{
  await bridge.disconnect();tell('USB session closed. No camera operation is running.');
 }));
 $('#fujix-camera-slot').addEventListener('change',()=>{
  const current=code(Number($('#fujix-camera-slot').value));
  if(current!==null)$('#fujix-camera-simulation').value=String(current);
  sync();
 });
 $('#fujix-camera-write-test').addEventListener('click',()=>void act(async()=>{
  const slot=Number($('#fujix-camera-slot').value),next=Number($('#fujix-camera-simulation').value);
  const current=code(slot),candidate=SIMULATIONS.find(x=>x.code===next);
  if(!bridge.current||!bridge.backup||current===null)throw Error('Back up all camera slots first');
  if(current===next)throw Error('Select a different film simulation to test. Nothing has changed.');
  const original=SIMULATIONS.find(x=>x.code===current)?.label||String(current);
  const prompt=`WRITE TO PHYSICAL X100VI?\n\nChange ONLY C${slot} Film Simulation from ${original} to ${candidate?.label}.\n\nAll 7 slots are backed up on this Mac (receipt ${bridge.backup.id}). Original C${slot} bytes will be used for rollback if verification fails. Do NOT unplug the camera during the test.\n\nProceed?`;
  if(!window.confirm(prompt)){tell('Canceled. No camera film setting was changed.');return}
  tell(`Changing C${slot}; verifying readback, all other settings, and original active C-slot selection…`);
  const result=await bridge.testOneSimulation(slot,next);
  $('#fujix-camera-output').textContent=JSON.stringify(result,null,2);
  tell(`Confirmed on camera: C${slot} ${result.from} → ${result.to}. The saved original backup is preserved; make a new backup before another change. Check the camera's menu to confirm.`);
 }));
 $('#fujix-camera-export').addEventListener('click',()=>{
  if(!bridge.current)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(bridge.current,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='X100VI-C1-C7-camera-snapshot-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  tell('Downloaded a readable snapshot. The independently SHA-256-verified original remains in Jarvis CameraPresetBackups.');
 });
 sync();
}
