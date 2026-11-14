/** FujiX Sync direct X100VI Wi-Fi bridge (macOS). Localhost only, no cloud. */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {TetherInbox} from './tether-inbox.mjs';
import {DirectCameraTransfer} from './direct-camera-transfer.mjs';
import {LocalPhotoLibrary} from './local-photo-library.mjs';
import {IncomingOriginalImport} from './incoming-original-import.mjs';
import {USBPhotoLibrary,USB_JPEG_MAX_BYTES} from './usb-photo-library.mjs';
import {MacAwake} from './mac-awake.mjs';
import {assessDualNetwork,cameraInterfaceCandidates} from './network-dual-wifi.mjs';
import {LocalCloudReceiver} from './local-cloud-receiver.mjs';
import {inspectOfflineReadiness} from './offline-workflow-readiness.mjs';
import {CameraProfileVault} from './camera-profile-vault.mjs';
import {saveCameraPresetBackup,verifyCameraPresetBackup} from './camera-preset-backup.mjs';
import {createMultishotProject,createContactSheetHtml} from './multishot-studio.mjs';
import {inspectOfflineImage} from './offline-image-inspector.mjs';
import {inspectX100viUsbPtpInventory,inspectX100viIoRegistry} from './usb-ptp-presence.mjs';
import {interpretX100viPtpReadonlyProbe} from './usb-ptp-probe-result.mjs';
import {interpretX100viVendorReadonlyResult} from './usb-vendor-readonly-result.mjs';
import {interpretX100viUsbTetherCapability} from './usb-tether-capability-result.mjs';
import {FILMKIT_RESEARCH,inspectFilmKitCapabilities} from './filmkit-capabilities.mjs';
import {renderOfflineTimelapse} from './offline-timelapse-render.mjs';
import {discoverLocalFfmpeg} from './ffmpeg-runtime.mjs';
import {createRecipeHubStore} from './recipe-hub-store.mjs';
import {CameraCardImport} from './camera-card-import.mjs';
import {UsbPtpCardCatalog} from './usb-ptp-card-catalog.mjs';
import {UsbPtpSelectedImport} from './usb-ptp-selected-import.mjs';
import {PhotoArchiveAudit} from './photo-archive-audit.mjs';
import {assessUsbWebcamReadiness} from './usb-webcam-readiness.mjs';
import {intakeRecipeUrl} from './recipe-hub-intake.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const WWW=path.join(ROOT,'web');
const recipeHubStore=createRecipeHubStore({filePath:path.join(ROOT,'data','recipe-hub-staged.json')});
async function recipeHubCatalog(){
 const original=JSON.parse(await fsp.readFile(path.join(WWW,'recipes.json'),'utf8'));
 let enrichment={};
 try{enrichment=JSON.parse(await fsp.readFile(path.join(WWW,'recipe-enrichment.json'),'utf8')).recipes||{}}
 catch(error){if(error.code!=='ENOENT')throw error}
 if(!Array.isArray(original.backups))throw Error('Original FujiX Sync recipe catalog is unavailable');
 const recipes=original.backups.flatMap(backup=>(backup.slots||[]).map(slot=>{
  const details=enrichment[slot.id]||{};
  const sourceUrl=details.sourceUrl||(Array.isArray(slot.links)?slot.links.find(url=>typeof url==='string'&&/^https:\/\//.test(url)):null)||null;
  let sourceLabel=details.sourceLabel||null;
  if(!sourceLabel&&sourceUrl){try{sourceLabel=new URL(sourceUrl).hostname.replace(/^www\./,'')}catch{}}
  const name=typeof slot.name==='string'?slot.name:'Unnamed saved recipe';
  return {
   id:slot.id,name,photo:slot.photo||null,settings:slot.settings||{},backupNumber:backup.backupNumber,
   slotNumber:slot.slotNumber,category:details.simulation||'Film simulation',
   description:details.description||'Saved Fujifilm film simulation recipe. See the original settings and reference photo for its appearance.',
   background:details.background||'This recipe was saved in your personal X100VI collection. Its creator story has not yet been independently checked.',
   sourceUrl,sourceUrls:details.sourceUrls||slot.links||[],sourceLabel,sourceVerified:details.sourceVerified===true,
   articleTitle:details.articleTitle||null,articleAuthor:details.articleAuthor||null,
   publishedDate:details.publishedDate||null,
   creatorNotes:Array.isArray(details.creatorNotes)?details.creatorNotes.slice(0,4):[],
   // Only source-verified photos from that exact creator article are eligible.
   // Gallery images remain on their creator host, never downloaded or guessed.
   samplePhotos:details.sourceVerified===true&&Array.isArray(details.samplePhotos)
    ?details.samplePhotos.filter(url=>typeof url==='string'&&url.startsWith('https://')).slice(0,8):[],
  };
 }));
 return {recipes,total:recipes.length,source:'Original owner-saved FujiX X100VI catalog; enrichment is additive and attributed'};
}
const PORT=Number(process.env.FUJI_LOCAL_PORT || 4194);
const LISTEN='127.0.0.1';
const FUJI_IP='192.168.0.1';
const FUJI_PORT=55740;
const MAC_WIFI_HELPER=path.join(ROOT,'bin','FujiXWiFi.app','Contents','MacOS','FujiXWiFi');
const MAC_WIFI_APP=path.join(ROOT,'bin','FujiXWiFi.app');
const LIMIT=8*1024*1024;
const tetherInbox=new TetherInbox();
// The default remains ~/Pictures. Jarvis can explicitly use the physical
// expansion drive for large RAF/JPEG originals without filling its boot SSD.
const localPhotos=new LocalPhotoLibrary({
 root:process.env.FUJIX_PHOTO_ROOT||path.join(os.homedir(),'Pictures','FujiX Sync'),
});
const photoAudit=new PhotoArchiveAudit({root:localPhotos.root});
const cardReader=new CameraCardImport({destination:path.join(localPhotos.root,'Originals')});
const ptpCardCatalog=new UsbPtpCardCatalog({root:localPhotos.root,appRoot:ROOT});
const ptpSelectedImport=new UsbPtpSelectedImport({root:localPhotos.root,appRoot:ROOT,catalog:ptpCardCatalog});
const localCloud=new LocalCloudReceiver({library:localPhotos});
const incomingOriginals=new IncomingOriginalImport({inbox:tetherInbox,library:localPhotos});
const usbPhotos=new USBPhotoLibrary();
const offlineProfiles=new CameraProfileVault({folder:process.env.FUJIX_PROFILE_VAULT_DIR||path.join(os.homedir(),'Pictures','FujiX Sync','Profile Vault')});
const TIMELAPSE_DIR=path.join(localPhotos.root,'Projects','TimeLapses');
const CAMERA_PRESET_BACKUP_DIR=path.join(localPhotos.root,'Projects','CameraPresetBackups');
const ffmpegRuntime=await discoverLocalFfmpeg();
const FF_MPEG=ffmpegRuntime.path;
const timelapseJob={running:false,status:'idle',startedAt:null,completedAt:null,detail:'No time-lapse render started',outputName:null,bytes:null,controller:null};
function timelapsePublicStatus(){
 const {controller,...data}=timelapseJob;
 return {...data,source:'imported-local-originals',cameraCapture:false,renderer:{available:ffmpegRuntime.available,reason:ffmpegRuntime.reason},destination:TIMELAPSE_DIR,fileUrl:timelapseJob.status==='completed'&&timelapseJob.outputName?'/api/studio/timelapse/file/'+timelapseJob.outputName:null};
}
async function ensureTimelapseDestination(){
 await localPhotos.prepare();
 let cursor=localPhotos.root;
 for(const segment of ['Projects','TimeLapses']){
  cursor=path.join(cursor,segment);
  await fsp.mkdir(cursor,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error});
  const metadata=await fsp.lstat(cursor);
  if(metadata.isSymbolicLink()||!metadata.isDirectory())throw Error('Unsafe timelapse output folder');
 }
 return cursor;
}
async function startTimelapseRender(body){
 if(timelapseJob.running)throw Error('A local time-lapse render is already running');
 if(!ffmpegRuntime.available)throw Error(ffmpegRuntime.reason);
 if(body?.confirm!==true)throw Error('Explicit confirmation is required before creating an MP4');
 if(!Array.isArray(body.ids)||body.ids.length<2||body.ids.length>180||new Set(body.ids).size!==body.ids.length)throw Error('Choose 2–180 distinct imported photo IDs');
 if(body.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id)))throw Error('Invalid local photo ID');
 const fps=body.fps===undefined?24:Number(body.fps);
 if(!Number.isInteger(fps)||fps<1||fps>60)throw Error('Frame rate must be 1–60');
 const current=await localPhotos.list(), names=[];
 for(const id of body.ids){
  const match=current.files.find(x=>x.id===id&&x.isOriginal===true&&/\.(?:jpg|jpeg|png)$/i.test(x.name));
  if(!match)throw Error('Time-lapse frames must be imported original JPEG/PNG photos in the Mac library; RAW requires prior JPEG conversion.');
  names.push(match.savedName);
 }
 const outputRoot=await ensureTimelapseDestination();
 const fsStats=await fsp.statfs(outputRoot);
 const totalSize=current.files.filter(file=>body.ids.includes(file.id)).reduce((n,file)=>n+file.bytes,0);
 if(totalSize>1024*1024*1024||fsStats.bavail*fsStats.bsize<totalSize*2+256*1024*1024)throw Error('Insufficient disk space for safe source staging and rendered video');
 const outputName='FujiX-Timelapse-'+new Date().toISOString().replace(/[.:-]/g,'').replace('T','-').slice(0,15)+'-'+crypto.randomBytes(4).toString('hex')+'.mp4';
 const controller=new AbortController();
 Object.assign(timelapseJob,{running:true,status:'rendering',startedAt:Date.now(),completedAt:null,detail:'Rendering from copied imported originals; camera is not used',outputName:null,bytes:null,controller});
 void renderOfflineTimelapse({sourceRoot:localPhotos.originals,outputRoot,filenames:names,outputName,fps,ffmpegPath:FF_MPEG,timeoutMs:120000,signal:controller.signal})
  .then(result=>Object.assign(timelapseJob,{running:false,status:'completed',completedAt:Date.now(),detail:'Local MP4 rendered from imported originals (not from a live camera stream)',outputName:result.outputName,bytes:result.bytes,controller:null}))
  .catch(error=>Object.assign(timelapseJob,{running:false,status:controller.signal.aborted?'canceled':'error',completedAt:Date.now(),detail:errorMessage(error),outputName:null,bytes:null,controller:null}));
 return timelapsePublicStatus();
}
const macAwake=new MacAwake();
const TETHER_SETTINGS=path.join(ROOT,'data','tether-inbox-settings.json');
try{
 const previous=JSON.parse(await fsp.readFile(TETHER_SETTINGS,'utf8'));
 if(typeof previous.folder==='string')await tetherInbox.configure(previous.folder);
}catch{ /* First launch, removed drive or invalid prior location: no folder monitored. */ }
const MAX_BODY=4096;
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.wasm':'application/wasm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.otf':'font/otf','.woff2':'font/woff2','.ico':'image/x-icon'};
const state={status:'idle',detail:'No X100VI Wi-Fi stream has been started',verified:false,frames:0,startedAt:null,lastFrameAt:null,process:null,clients:new Set(),buffer:Buffer.alloc(0),lastFrame:null};
let shutterAttempted=false;
let shutterPending=null;
function finishShutter(accepted,detail){
 if(!shutterPending)return;
 const pending=shutterPending;shutterPending=null;clearTimeout(pending.timeout);
 pending.resolve({ok:accepted,commandAccepted:accepted,photoSaved:'unverified',detail});
}
function attemptWifiShutter(){
 if(shutterPending)return Promise.resolve({ok:false,commandAccepted:false,photoSaved:'unverified',detail:'A camera shutter command is already pending.'});
 if(shutterAttempted)return Promise.resolve({ok:false,commandAccepted:false,photoSaved:'unverified',detail:'A shutter request was already attempted on this session. Reconnect and verify the camera before another attempt.'});
 if(state.status!=='live'||!state.verified||state.frames<1||!state.process||!state.lastFrameAt||Date.now()-state.lastFrameAt>5000||!state.process.stdin?.writable){
  return Promise.resolve({ok:false,commandAccepted:false,photoSaved:'unverified',detail:'Wi-Fi shutter is locked until a real X100VI session and fresh native camera frames are verified.'});
 }
 shutterAttempted=true;
 return new Promise(resolve=>{
  const timeout=setTimeout(()=>finishShutter(false,'The camera did not acknowledge the capture request. Do not assume a picture was taken.'),8000);
  shutterPending={resolve,timeout};
  try{state.process.stdin.write('SHOOT\n',error=>{if(error)finishShutter(false,'The native X100VI session could not receive the capture command.');});}
  catch{finishShutter(false,'The native X100VI session could not receive the capture command.');}
 });
}
// Diagnostic is explicitly user-triggered and never fires the shutter.
const bleDiagnostic={stage:'idle',detail:'No native Bluetooth authentication test run',lastRun:null,running:false};
// Independent native photographic shutter path: acknowledgement of GATT writes
// is NOT proof the X100VI saved an exposure, and never implies RAF transfer.
const nativeShutter={stage:'idle',detail:'No native shutter attempt',lastRun:null,running:false,commandAccepted:false,photoSaved:'unverified'};
function fireNativeShutter(){
 if(nativeShutter.running||bleDiagnostic.running)return null;
 Object.assign(nativeShutter,{stage:'connecting',detail:'Connecting to the physical X100VI over Bluetooth',lastRun:Date.now(),running:true,commandAccepted:false,photoSaved:'unverified'});
 const child=spawn(path.join(ROOT,'bin','ble-native'),['--shoot'],{cwd:ROOT,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir()}});
 let finished=false,buffer='',acked=false;
 const finish=(success,detail)=>{
  if(finished)return;finished=true;clearTimeout(timeout);
  nativeShutter.running=false;nativeShutter.commandAccepted=success;
  nativeShutter.stage=success?'command-acknowledged':'error';
  nativeShutter.detail=detail;
 };
 const timeout=setTimeout(()=>{
  try{child.kill('SIGTERM')}catch{}
  finish(false,'X100VI shutter session timed out. No successful photo or shutter operation verified.');
 },39000);
 child.stdout.on('data',data=>{
  buffer=(buffer+data.toString()).slice(-3000);
  const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
  for(const line of lines){
   if(line.includes('GATT_CONNECTED')){nativeShutter.stage='connected';nativeShutter.detail='X100VI Bluetooth GATT connected; authenticating'}
   else if(line.includes('SECURE_HANDSHAKE_COMPLETED')){nativeShutter.stage='authenticated';nativeShutter.detail='X100VI secure handshake succeeded; locating hardware shutter'}
   else if(line.includes('SHUTTER_CHARACTERISTIC_FOUND')){nativeShutter.stage='sending';nativeShutter.detail='Sending physical X100VI shutter press and release'}
   else if(line.includes('SHUTTER_COMMAND_SEQUENCE_ACKED')){acked=true;nativeShutter.stage='acknowledging';nativeShutter.detail='Camera accepted shutter command writes; checking command completion'}
   else if(line.includes('WRITE_FAILED')||line.includes('DISCONNECTED')){nativeShutter.detail='X100VI Bluetooth shutter failed: '+line.slice(0,145)}
  }
 });
 child.stderr.on('data',()=>{});
 child.on('error',error=>finish(false,'Could not launch native shutter: '+errorMessage(error)));
 child.on('exit',code=>finish(code===0&&acked,code===0&&acked
  ? 'Physical X100VI acknowledged a shutter press/release. Check camera SD for the resulting exposure; full-resolution file is not yet transferred.'
  : nativeShutter.detail.startsWith('X100VI Bluetooth shutter failed:')?nativeShutter.detail
  : 'Camera did not complete the authenticated shutter command. No photo has been verified.'));
 return {...nativeShutter};
}
const cameraPhotoCache={items:[],total:0,listedAt:0,host:FUJI_IP};
const lanCamera={host:null,identifiedAt:0,lastError:null};
let cameraPhotoBusy=false;
// Run read-only gallery operations in a separate Fujifilm PTP/IP session. Never
// steal the active live-view/shutter connection or auto-download camera content.
function cameraGalleryHelper(args,{binary=path.join(ROOT,'bin','camera-gallery'),timeoutMs=40000,maxBytes=4*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd:ROOT,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir()}});
  const chunks=[];let size=0;let detail='';let finished=false;
  const stop=(error,output)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(output)};
  const timer=setTimeout(()=>{child.kill('SIGTERM');stop(new Error('Camera gallery operation timed out. Return to shooting mode and reconnect if needed.'))},timeoutMs);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){child.kill('SIGTERM');stop(new Error('Camera photo exceeds the safe transfer size limit. Use an SD card reader for this file.'));return}chunks.push(chunk)});
  child.stderr.on('data',chunk=>{detail=(detail+chunk.toString()).slice(-4000)});
  child.on('error',e=>stop(new Error('Native Fujifilm gallery helper unavailable: '+errorMessage(e))));
  // Wait for stdout and stderr to close before requiring PHOTO_COMPLETE.
  child.on('close',code=>{
   if(finished)return;
   const identify=args.includes('--identify');
   if(code!==0||!detail.includes(identify?'PHOTO_IDENTIFIED':'PHOTO_VERIFIED')){stop(new Error('Camera refused the Fujifilm PTP/IP session or did not report X100VI identity. '+detail.split('\n').filter(line=>line.includes('PHOTO_')).slice(-1).join('').slice(0,160)));return}
   if(args.includes('--download')&&!detail.includes('PHOTO_COMPLETE')){stop(new Error('Camera did not confirm a complete original photo download.'));return}
   stop(null,Buffer.concat(chunks,size));
  });
 });
}
async function homeLanCameraReady(ip){
 const network=await dualNetworkStatus();
 if(!network.mainWifiIsDefault||!isSameLanCameraIp(ip,network.primaryWifiIPv4||''))throw Error('Enter a camera IP on the Mac home Wi-Fi subnet; the main Wi-Fi route must remain active.');
 return network;
}
async function cameraGalleryAccess({host=FUJI_IP}={}){
 if(state.process||state.status==='connecting'||state.status==='live')throw Error('Stop native camera live view before browsing SD-card photos. Gallery and live view use separate camera sessions.');
 if(host!==FUJI_IP){
  await homeLanCameraReady(host);
  if(host!==lanCamera.host||Date.now()-lanCamera.identifiedAt>120000)throw Error('Re-identify the X100VI camera on your home network before accessing camera files.');
  if(!await probeHost(host))throw Error('X100VI gallery port is no longer reachable on your home Wi-Fi.');
  return;
 }
 const network=await connectivity();
 if(!network.inCameraSubnet||!network.ptpReachable)throw Error('Mac is not connected to the X100VI direct camera Wi-Fi PTP/IP service. Photos cannot be read from Bluetooth shutter control or a WPS router registration.');
}
async function listCameraPhotos({limit=200,host=FUJI_IP}={}){
 if(cameraPhotoBusy)throw Error('Another camera gallery operation is already running.');
 cameraPhotoBusy=true;
 try{
  await cameraGalleryAccess({host});
  if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid camera gallery page limit.');
  const args=limit===200?['--list']:['--list',String(limit)];
  const output=await cameraGalleryHelper(host===FUJI_IP?args:['--host-ip',host,...args],host===FUJI_IP?{}:{binary:path.join(ROOT,'bin','camera-gallery-lan')});
  const parsed=JSON.parse(output.toString('utf8'));
  if(parsed.verified!==true||!Array.isArray(parsed.items))throw Error('Camera did not provide a verified gallery listing.');
  const items=parsed.items.filter(item=>Number.isInteger(item.handle)&&item.handle>0&&item.handle<=0xffffffff&&typeof item.name==='string'&&/^[a-zA-Z0-9_.-]{1,63}$/.test(item.name)&&Number.isInteger(item.bytes)&&item.bytes>=0&&item.bytes<=128*1024*1024).slice(0,200);
  cameraPhotoCache.items=items;cameraPhotoCache.total=Number.isInteger(parsed.total)?parsed.total:items.length;cameraPhotoCache.listedAt=Date.now();cameraPhotoCache.host=host;
  if(host!==FUJI_IP&&host===lanCamera.host)lanCamera.identifiedAt=Date.now();
  return {verified:true,items,total:cameraPhotoCache.total,note:'These are files reported by the camera gallery, not live-view screenshots. Downloads are manual; camera gallery compatibility is experimental.'};
 }finally{cameraPhotoBusy=false}
}
async function readCameraPhoto(handle,{host=FUJI_IP}={}){
 if(!Number.isSafeInteger(handle)||handle<=0||Date.now()-cameraPhotoCache.listedAt>120000)throw Error('Refresh the camera photo list before downloading.');
 if(cameraPhotoCache.host!==host)throw Error('Camera source changed since the verified listing. Refresh the selected camera gallery.');
 const item=cameraPhotoCache.items.find(x=>x.handle===handle);
 if(!item)throw Error('Photo is not in the latest verified camera listing.');
 if(cameraPhotoBusy)throw Error('Another camera gallery operation is already running.');
 cameraPhotoBusy=true;
 try{
  await cameraGalleryAccess({host});
  const args=['--download',String(handle),item.name,String(item.bytes)];
  const bytes=await cameraGalleryHelper(host===FUJI_IP?args:['--host-ip',host,...args],{timeoutMs:90000,maxBytes:128*1024*1024,...(host===FUJI_IP?{}:{binary:path.join(ROOT,'bin','camera-gallery-lan')})});
  if(bytes.length!==item.bytes)throw Error('Camera returned an incomplete original file; no photo was imported.');
  return {item,bytes};
 }finally{cameraPhotoBusy=false}
}
const autoTransfer=new DirectCameraTransfer({
 destination:path.join(os.homedir(),'Pictures','FujiX Sync Incoming'),
 ready:async()=>{
  if(state.process||state.status==='connecting'||state.status==='live'||cameraPhotoBusy)return false;
  const network=await connectivity();return network.inCameraSubnet&&network.ptpReachable;
 },
 list:()=>listCameraPhotos({limit:40}),
 download:async item=>{
  const result=await readCameraPhoto(item.handle);
  if(result.item.name!==item.name||result.item.bytes!==item.bytes)throw Error('Camera gallery changed between listing and transfer. Refusing to save the wrong file.');
  return result.bytes;
 },
});
// Experimental home-router gallery poller: works only if this X100VI firmware
// actively exposes Fujifilm PTP/IP over its infrastructure Wi-Fi connection.
// Completely independent of the Mac-hosted Local Cloud receiving endpoint.
const lanAutoTransfer=new DirectCameraTransfer({
 destination:path.join(os.homedir(),'Pictures','FujiX Sync Incoming'),
 unavailableMessage:'The home-router X100VI PTP/IP gallery is not ready. Identify the camera on the main LAN before monitoring originals.',
 modeNote:'Home-router X100VI PTP/IP gallery monitor. Requires an identified Fujifilm session and camera firmware serving PTP/IP over infrastructure Wi-Fi. Downloads only real new SD originals; not Frame.io push and not a proven X100VI feature.',
 ready:async()=>{
  if(!lanCamera.host||Date.now()-lanCamera.identifiedAt>120000||cameraPhotoBusy||state.process||autoTransfer.active||autoTransfer.starting)return false;
  try{await homeLanCameraReady(lanCamera.host)}catch{return false}
  return probeHost(lanCamera.host);
 },
 list:()=>listCameraPhotos({limit:40,host:lanCamera.host}),
 download:async item=>{
  const result=await readCameraPhoto(item.handle,{host:lanCamera.host});
  if(result.item.name!==item.name||result.item.bytes!==item.bytes)throw Error('Camera gallery changed during original download.');
  return result.bytes;
 },
});
const API='FUJIX_X100VI_WIFI_BRIDGE';
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))}
function status(){return {app:API,status:state.status,detail:state.detail,verified:state.verified,frames:state.frames,clients:state.clients.size,startedAt:state.startedAt,lastFrameAt:state.lastFrameAt,shutterAvailable:state.status==='live'&&state.verified&&state.frames>0&&Boolean(state.process)&&Boolean(state.lastFrameAt)&&Date.now()-state.lastFrameAt<5000&&!shutterAttempted&&!shutterPending,shutterAttempted,connection: 'X100VI direct Wi-Fi PTP/IP',cameraIp:FUJI_IP}}
function errorMessage(e){return String(e?.message||e||'unknown').slice(0,200)}
function execOut(file,args,timeout=3500,maxBuffer=64*1024){return new Promise((resolve,reject)=>{execFile(file,args,{timeout,maxBuffer},(err,stdout,stderr)=>err?reject(new Error((stderr||err.message).trim().slice(0,180))):resolve(stdout))})}
async function cameraNetworkReady(){
  // Detect both the built-in Wi-Fi and any already-connected second adapter.
  // Do not associate with a new network, alter service order, or replace the
  // Mac's default Internet route. A candidate subnet is not proof of X100VI.
  const candidates=cameraInterfaceCandidates(os.networkInterfaces());
  let routedInterface=null;
  try{
    const route=await execOut('/sbin/route',['-n','get',FUJI_IP]);
    routedInterface=/^\s*interface:\s*(en\d+)\s*$/m.exec(route)?.[1]||null;
  }catch{}
  const camera=candidates.find(item=>item.interface===routedInterface);
  return {inCameraSubnet:Boolean(camera),localIp:camera?.localIp||null,cameraInterface:camera?.interface||null};
}
async function dualNetworkStatus(){
  let ports='',defaultRouteInterface=null;
  try{ports=await execOut('/usr/sbin/networksetup',['-listallhardwareports'],4500)}catch{}
  try{
    const route=await execOut('/sbin/route',['-n','get','default'],3500);
    defaultRouteInterface=/^\s*interface:\s*(\S+)\s*$/m.exec(route)?.[1]||null;
  }catch{}
  return assessDualNetwork({hardwarePorts:ports,interfaces:os.networkInterfaces(),defaultRouteInterface});
}
function probeCamera(timeout=2200){return new Promise(resolve=>{const sock=net.connect({host:FUJI_IP,port:FUJI_PORT});let complete=false;const done=(online)=>{if(complete)return;complete=true;sock.destroy();resolve(online)};sock.setTimeout(timeout,()=>done(false));sock.once('connect',()=>done(true));sock.once('error',()=>done(false))})}
async function connectivity(){const network=await cameraNetworkReady();return {...network,ptpReachable:network.inCameraSubnet?await probeCamera():false}}
// macOS enumerates the X100VI as a UVC input only when USB WEBCAM mode is
// physically online. Discovery does not open the camera or claim real frames.
let usbCache = {at:0,result:null};
function parseUsbVideoStatus(output){
  const cameraPresent=/^\s*FUJIFILM X100VI:\s*$/mi.test(String(output)) || /^\s*X100VI:\s*$/mi.test(String(output));
  return {cameraPresent,deviceLabel:cameraPresent?'FUJIFILM X100VI':null,transport:cameraPresent?'usb-webcam':null,actualVideoFramesVerified:false};
}
async function macUsbVideoStatus({refresh=false}={}){
  if(!refresh&&usbCache.result&&Date.now()-usbCache.at<3500)return usbCache.result;
  try{
    const output=await execOut('/usr/sbin/system_profiler',['SPCameraDataType'],3500);
    usbCache={at:Date.now(),result:{...parseUsbVideoStatus(output),checkedAt:Date.now(),available:true}};
  }catch{
    usbCache={at:Date.now(),result:{cameraPresent:false,deviceLabel:null,transport:null,actualVideoFramesVerified:false,checkedAt:Date.now(),available:false,note:'macOS camera enumeration was unavailable'}};
  }
  return usbCache.result;
}
// Separate presence-only USB PTP status. Never conflate successful USB
// enumeration with a PTP session, camera webcam video, shutter or saved photo.
// No camera USB protocol commands are sent by this endpoint.
let ptpPresenceCache={at:0,result:null};
async function macX100viPtpPresence(){
  if(ptpPresenceCache.result&&Date.now()-ptpPresenceCache.at<7500)return ptpPresenceCache.result;
  try{
    let result=null,source=null;
    for(const profile of ['SPUSBHostDataType','SPUSBDataType']){
      try{
        const output=await execOut('/usr/sbin/system_profiler',[profile,'-json'],6000);
        result=inspectX100viUsbPtpInventory(JSON.parse(output));
        source=profile;
        if(result.detected)break;
      }catch{}
    }
    if(!result?.detected){
      try{
        const io=await execOut('/usr/sbin/ioreg',['-p','IOUSB','-w0','-l'],4500,256*1024);
        const found=inspectX100viIoRegistry(io);
        result=found;source='IOUSBHostDevice';
      }catch{
        // An unavailable secondary inventory does not invalidate a
        // successfully read profiler inventory.
      }
    }
    if(!result)throw Error('No readable USB inventory');
    ptpPresenceCache={at:Date.now(),result:{...result,inventorySource:source,available:true,checkedAt:Date.now()}};
  }catch{
    // A profiler error is not proof the camera was disconnected.
    ptpPresenceCache={at:Date.now(),result:{detected:false,available:false,ptpSessionVerified:false,
      usbPhotographicCaptureVerified:false,stillPhotoSaved:'unverified',webcamVideoDetected:false,
      shutterAvailable:false,note:'macOS USB PTP inventory unavailable; no USB commands were attempted',checkedAt:Date.now()}};
  }
  return ptpPresenceCache.result;
}
// Only an explicit user POST can run the native read-only PTP metadata probe.
// Presence polling never starts it. No shutter, property write, file download,
// or firmware command is included in the fixed native executable.
let ptpReadOnlyProbe={stage:'idle',running:false,lastAttemptAt:null,ptpSessionVerified:false,
  shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',detail:'No read-only camera PTP session test performed'};
let ptpVendorReadOnly={stage:'idle',running:false,lastAttemptAt:null,ptpSessionVerified:false,
  shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',tetherModeSupported:'not-established',
  detail:'No Fujifilm USB compatibility metadata test performed'};
let ptpTetherCapability={stage:'idle',running:false,lastAttemptAt:null,ptpSessionVerified:false,
  shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',
  detail:'No read-only X100VI USB tether capability test performed'};
let ptpProbeLock=false;
function checkPtpReadOnlyCooldown(){
  if(ptpProbeLock||ptpReadOnlyProbe.running||ptpVendorReadOnly.running||ptpTetherCapability.running)
    throw Error('Another read-only camera PTP probe is already running');
  if(Math.max(ptpReadOnlyProbe.lastAttemptAt||0,ptpVendorReadOnly.lastAttemptAt||0,
      ptpTetherCapability.lastAttemptAt||0)>Date.now()-30000)
    throw Error('Wait at least 30 seconds between manual camera PTP diagnostics');
  // Reserve the camera BEFORE the first await, closing the window where two
  // simultaneous localhost POSTs could both open exclusive PTP sessions.
  ptpProbeLock=true;
}
async function requireIdleX100viPtp(){
  const presence=await macX100viPtpPresence();
  if(!presence.available||!presence.detected)
    throw Error('The exact X100VI USB PTP device is not presently detected on this Mac');
  if(state.process||autoTransfer.active||autoTransfer.starting||lanAutoTransfer.active||lanAutoTransfer.starting)
    throw Error('Stop active camera transfers or Wi-Fi live shooting before checking USB PTP');
}
async function runX100viReadOnlyProbe(){
  checkPtpReadOnlyCooldown();
  try {
  await requireIdleX100viPtp();
  const helper=path.join(ROOT,'tools','.bin','x100vi-ptp-readonly');
  if(!fs.existsSync(helper))throw Error('Read-only native PTP helper is unavailable');
  ptpReadOnlyProbe={...ptpReadOnlyProbe,running:true,stage:'checking',lastAttemptAt:Date.now(),
    ptpSessionVerified:false,shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',
    detail:'Opening one read-only X100VI PTP DeviceInfo session; no shutter commands'};
  const {output,code}=await new Promise(resolve=>{
    execFile(helper,[],{timeout:21000,maxBuffer:32768},(error,stdout)=>{
      resolve({output:String(stdout||''),code:error?Number.isInteger(error.code)?error.code:2:0});
    });
  });
  const result=interpretX100viPtpReadonlyProbe(output,code);
  ptpReadOnlyProbe={...result,running:false,stage:result.ptpSessionVerified?'verified':'unavailable',
    lastAttemptAt:ptpReadOnlyProbe.lastAttemptAt};
  return {...ptpReadOnlyProbe};
  } finally {ptpProbeLock=false;}
}
async function runX100viVendorReadOnlyProbe(){
  checkPtpReadOnlyCooldown();
  try {
  await requireIdleX100viPtp();
  const helper=path.join(ROOT,'tools','.bin','x100vi-fuji-vendor-probe');
  if(!fs.existsSync(helper))throw Error('Fixed read-only Fujifilm USB metadata helper is unavailable');
  ptpVendorReadOnly={...ptpVendorReadOnly,running:true,stage:'checking',lastAttemptAt:Date.now(),
    ptpSessionVerified:false,shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',
    tetherModeSupported:'not-established',detail:'Reading five advertised USB properties; no camera writes, shutter or firmware'};
  const {output,code}=await new Promise(resolve=>{
    execFile(helper,['--tether-compat-readonly'],{timeout:24000,maxBuffer:32768},(error,stdout)=>{
      resolve({output:String(stdout||''),code:error?Number.isInteger(error.code)?error.code:2:0});
    });
  });
  const result=interpretX100viVendorReadonlyResult(output,code);
  ptpVendorReadOnly={...result,running:false,lastAttemptAt:ptpVendorReadOnly.lastAttemptAt};
  return {...ptpVendorReadOnly};
  } finally {ptpProbeLock=false;}
}
async function runX100viUsbTetherCapabilityProbe(){
  checkPtpReadOnlyCooldown();
  try {
    await requireIdleX100viPtp();
    const helper=path.join(ROOT,'tools','.bin','x100vi-usb-tether-capability');
    if(!fs.existsSync(helper))throw Error('X100VI USB tether capability inspection executable is missing');
    ptpTetherCapability={...ptpTetherCapability,running:true,stage:'checking',lastAttemptAt:Date.now(),
      ptpSessionVerified:false,shutterAvailable:false,shutterAttempted:false,photoSaved:'unverified',
      detail:'Reading USB capture operations and storage types only; no shutter, write or firmware command'};
    const {output,code}=await new Promise(resolve=>{
      execFile(helper,['--read-only'],{timeout:24000,maxBuffer:32768},(error,stdout)=>{
        resolve({output:String(stdout||''),code:error?Number.isInteger(error.code)?error.code:2:0});
      });
    });
    const result=interpretX100viUsbTetherCapability(output,code);
    ptpTetherCapability={...result,running:false,lastAttemptAt:ptpTetherCapability.lastAttemptAt};
    return {...ptpTetherCapability};
  } finally {ptpProbeLock=false;}
}
/** Explicit, single-host infrastructure-LAN test. No subnet scan or Wi-Fi switching. */
function isSameLanCameraIp(candidate, macIp) {
  if(net.isIP(candidate)!==4||net.isIP(macIp)!==4||candidate===macIp)return false;
  const a=candidate.split('.').map(Number),b=macIp.split('.').map(Number);
  // Same /24 network; block network, broadcast and common router addresses.
  return a.slice(0,3).every((v,i)=>v===b[i])&&a[3]>1&&a[3]<254;
}
function probeHost(host,timeout=1800){return new Promise(resolve=>{const socket=net.connect({host,port:FUJI_PORT});let complete=false;const done=reachable=>{if(complete)return;complete=true;socket.destroy();resolve(reachable)};socket.setTimeout(timeout,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false))})}
function isCameraSubnet(ip){return /^192\.168\.0\.(?:[1-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$/.test(ip)}
function closeClients(){for(const client of state.clients){try{client.end()}catch{}}state.clients.clear()}
function killBridge(preserveError=false){finishShutter(false,'Camera session ended before the shutter operation completed.');const previousStatus=state.status,previousDetail=state.detail;if(state.process){const child=state.process;state.process=null;try{child.kill('SIGTERM')}catch{}const force=setTimeout(()=>{if(child.exitCode===null && child.signalCode===null){try{child.kill('SIGKILL')}catch{}}},3000);force.unref?.()}state.status=preserveError&&previousStatus==='error'?'error':'idle';state.detail=preserveError&&previousStatus==='error'?previousDetail:'Direct live view stopped';state.verified=false;state.buffer=Buffer.alloc(0);closeClients()}
function dispatchFrame(frame){state.lastFrame=frame;state.lastFrameAt=Date.now();state.frames++;for(const client of state.clients){try{client.write(`--fujixframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);if(!client.write(frame)){state.clients.delete(client);client.end();continue}client.write('\r\n')}catch{state.clients.delete(client);try{client.end()}catch{}}}}
function ingestChunk(chunk){state.buffer=Buffer.concat([state.buffer,chunk]);while(state.buffer.length>=4){const len=state.buffer.readUInt32BE(0);if(len<128||len>LIMIT){state.status='error';state.detail='Camera stream sent an invalid frame size';killBridge(true);return}if(state.buffer.length<4+len)break;const frame=state.buffer.subarray(4,4+len);state.buffer=state.buffer.subarray(4+len);if(frame[0]!==0xff||frame[1]!==0xd8){state.status='error';state.detail='Camera stream produced non-JPEG data';killBridge(true);return}dispatchFrame(frame)}if(state.buffer.length>LIMIT+4){state.status='error';state.detail='Camera stream buffer exceeded limit';killBridge(true)}}
function launchCamera({binary=path.join(ROOT,'bin','direct-live'),args=['--x100vi']}={}){if(state.process)return;shutterAttempted=false;finishShutter(false,'Prior camera session replaced.');state.status='connecting';state.detail='Opening X100VI direct PTP/IP Wi-Fi session';state.verified=false;state.frames=0;state.lastFrame=null;state.buffer=Buffer.alloc(0);state.startedAt=Date.now();state.lastFrameAt=null;const child=spawn(binary,args,{cwd:ROOT,stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir()}});state.process=child;child.stdout.on('data',buf=>{if(state.process===child)ingestChunk(buf)});let stderrBuffer='';child.stderr.on('data',buf=>{stderrBuffer+=buf.toString();if(stderrBuffer.length>10000)stderrBuffer=stderrBuffer.slice(-4000);let lines=stderrBuffer.split(/\r?\n/);stderrBuffer=lines.pop()||'';for(const line of lines){if(line.includes('PTP_SHUTTER_REQUEST_ACCEPTED')){finishShutter(true,'Camera PTP/IP acknowledged a single experimental InitiateCapture request. Check X100VI SD card for a real image.')}else if(line.includes('PTP_SHUTTER_REJECTED')){finishShutter(false,line.slice(0,180))}else if(line.includes('PTP_X100VI_VERIFIED')){state.verified=true;state.detail='Connected to verified X100VI; preparing live video'}else if(line.includes('PTP_LIVEVIEW_READY')){state.status='live';state.detail='Native X100VI Wi-Fi live-view socket is open'}else if(/PTP_UNREACHABLE|PTP_SETUP_FAILED|PTP_LIVEVIEW_FAILED|CAMERA_MISMATCH|PTP_FRAME_ERROR|PTP_FRAME_NOT_JPEG|PTP_ENDED_UNEXPECTEDLY/.test(line)){state.status='error';state.detail=line.replace(/[\r\n]/g,' ').slice(0,170)}}});child.on('error',err=>{state.status='error';state.detail='Native camera bridge unavailable: '+errorMessage(err);state.process=null;closeClients()});child.on('exit',(code,signal)=>{if(state.process!==child)return;finishShutter(false,'Native X100VI session ended without confirming a photo.');state.process=null;if(state.status==='connecting'||state.status==='live'){state.status='error';state.detail='Camera Wi-Fi stream ended (exit '+code+', signal '+(signal||'none')+')'}closeClients()})}
async function readBody(req,maxBytes=MAX_BODY){const chunks=[];let bytes=0;for await(const buf of req){bytes+=buf.length;if(bytes>maxBytes)throw Error('Request too large');chunks.push(buf)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
const prohibitedOrigin=req=>{const origin=req.headers.origin;const host=req.headers.host;const port=server.address()?.port||PORT;if(!['127.0.0.1:'+port,'localhost:'+port].includes(host))return true;return Boolean(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))};
async function joinCamera(body){if(typeof body.ssid!=='string'||body.ssid.length>127||!/^FUJI(?:FILM)?[-_a-zA-Z0-9. ]*$|^X100[-_a-zA-Z0-9. ]*$/.test(body.ssid))throw Error('Enter a Fujifilm X100VI Wi-Fi network name, not your home network');if(typeof body.password!=='string'||body.password.length>199)throw Error('Invalid Wi-Fi password');const helper=fs.existsSync(MAC_WIFI_HELPER)?MAC_WIFI_HELPER:path.join(ROOT,'bin','wifi-associate');const args=helper===MAC_WIFI_HELPER?['--join']:[];await new Promise((resolve,reject)=>{const child=spawn(helper,args,{stdio:['pipe','pipe','pipe']});let stderr='';let done=false;const deadline=setTimeout(()=>{if(done)return;done=true;child.kill('SIGTERM');reject(new Error('Camera Wi-Fi association timed out after 20 seconds. Confirm camera hotspot is active.'))},20000);const finish=(err)=>{if(done)return;done=true;clearTimeout(deadline);err?reject(err):resolve()};child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-1000)});child.on('error',finish);child.on('exit',code=>finish(code===0?null:new Error(stderr.trim().slice(0,200)||'Unable to join camera Wi-Fi')));child.stdin.end(JSON.stringify({ssid:body.ssid,password:body.password}))});return {ok:true,message:'Mac Wi-Fi association requested. Camera PTP/IP is checked separately. Your prior internet network may disconnect.'}}
async function scanCameraNetworks(){const helper=fs.existsSync(MAC_WIFI_HELPER)?MAC_WIFI_HELPER:path.join(ROOT,'bin','wifi-scan');const output=await execOut(helper,helper===MAC_WIFI_HELPER?['--scan']:[],12000);const result=JSON.parse(output);return {ok:result.ok===true,cameras:Array.isArray(result.cameras)?result.cameras:[],error:result.error||null,networkNamesHidden:result.networkNamesHidden===true,permission:result.permission||'unknown',visibleNetworkCount:Number(result.visibleNetworkCount)||0}}
// The ad-hoc-signed Intel helper can take several seconds to cold-start
// from an external ExFAT volume. A short timeout incorrectly reported
// "permission unavailable" even when the read-only helper was healthy.
async function macWifiPermissionStatus(){if(!fs.existsSync(MAC_WIFI_HELPER))return {permission:'helper-unavailable'};return JSON.parse(await execOut(MAC_WIFI_HELPER,['--permission-status'],12000))}
async function requestMacWifiPermission(){if(!fs.existsSync(MAC_WIFI_APP))throw Error('Location-aware Wi-Fi helper is not installed');await execOut('/usr/bin/open',['-a',MAC_WIFI_APP,'--args','--authorize'],3500);return {ok:true,message:'macOS Location permission request opened for FujiX Sync Wi-Fi Helper. Approve in macOS only if you want to reveal Wi-Fi network names to this app. No location coordinates are requested.'}}
// User-triggered macOS pairing UI; does NOT silently pair, unpair, or certify a camera connection.
async function openBluetoothSettings(){await execOut('/usr/bin/open',['x-apple.systempreferences:com.apple.Bluetooth'],3000);return {ok:true,message:'Opened macOS Bluetooth settings. Bluetooth pairing still requires confirmation on the camera and Mac.'}}
async function testNativeBluetooth(){
  // The macOS helper can fail synchronously before Node has attached process
  // callbacks (for example when macOS rejects executing a native binary).
  // Never leave the application stuck in an everlasting "scanning" state.
  if(bleDiagnostic.running&&Date.now()-(bleDiagnostic.lastRun||0)>45000){
    bleDiagnostic.running=false;bleDiagnostic.stage='error';
    bleDiagnostic.detail='Native Bluetooth diagnostic expired; no authenticated X100VI shutter was established.';
  }
  if(bleDiagnostic.running)return {...bleDiagnostic};
  bleDiagnostic.running=true;bleDiagnostic.stage='scanning';bleDiagnostic.detail='Scanning for the X100VI secure Bluetooth advertisement';bleDiagnostic.lastRun=Date.now();
  const tool=path.join(ROOT,'bin','ble-native');
  let child;
  try{
    child=spawn(tool,[],{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir()}});
  }catch(error){
    bleDiagnostic.running=false;bleDiagnostic.stage='error';
    bleDiagnostic.detail='Cannot start macOS Bluetooth diagnostic: '+errorMessage(error);
    return {...bleDiagnostic};
  }
  let buffer='';let finished=false;
  const done=(stage,detail)=>{if(finished)return;finished=true;clearTimeout(timeout);bleDiagnostic.running=false;bleDiagnostic.stage=stage;bleDiagnostic.detail=detail};
  const timeout=setTimeout(()=>{
    const stage=bleDiagnostic.stage;
    const detail=stage==='camera-found'
      ? 'X100VI was discovered but no GATT connection completed. The camera may reject this Mac as an unbonded client; check macOS Bluetooth pairing rather than rescanning.'
      : stage==='gatt-connected'||stage==='challenge-read'
        ? `X100VI reached ${stage} but secure authorization did not complete. The missing encrypted macOS Bluetooth bond is a likely blocker.`
        : stage==='error'
          ? bleDiagnostic.detail
          : 'X100VI did not advertise a usable Bluetooth connection in the allowed test window. Check camera power and Bluetooth pairing mode.';
    try{child.kill('SIGTERM')}catch{}
    done('error',detail);
  },39000);
  child.stdout.on('data',chunk=>{
    buffer=(buffer+chunk.toString()).slice(-5000);
    const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
    for(const line of lines){
      if(!line.startsWith('BLE_AUTH '))continue;
      if(line.includes('X100VI_FOUND')){bleDiagnostic.stage='camera-found';bleDiagnostic.detail='X100VI is advertising and has been detected. Waiting for macOS to establish the Bluetooth GATT link.'}
      else if(line.includes('GATT_CONNECTED')){bleDiagnostic.stage='gatt-connected';bleDiagnostic.detail='macOS opened X100VI Bluetooth GATT. Attempting secure authentication.'}
      else if(line.includes('STATUS_CHALLENGE_READ')){bleDiagnostic.stage='challenge-read';bleDiagnostic.detail='Read X100VI secure challenge. Camera bonding/acknowledgment is being checked.'}
      else if(line.includes('SECURE_HANDSHAKE_COMPLETED')){bleDiagnostic.stage='authenticated';bleDiagnostic.detail='Native secure BLE handshake succeeded. Camera will disconnect when this diagnostic exits.'}
      else if(line.includes('DISCONNECTED')){bleDiagnostic.stage='error';bleDiagnostic.detail='Camera disconnected during Bluetooth secure handshake. It may require camera-side pairing registration or OS-level bonding.'}
      else if(line.includes('WRITE_FAILED')){bleDiagnostic.stage='error';bleDiagnostic.detail='The camera refused a secure Bluetooth write. Check X100VI pairing registration and paired destination.'}
      else if(line.includes('GATT_ERROR')){bleDiagnostic.stage='error';bleDiagnostic.detail='X100VI was discovered but macOS could not establish the GATT link. Check camera Bluetooth pairing destination and close other remote-control sessions.'}
    }
  });
  child.stderr.on('data',()=>{});
  child.on('error',error=>done('error','Could not launch the native Bluetooth diagnostic: '+errorMessage(error)));
  child.on('exit',code=>done(code===0?'authenticated':'error',code===0?'Native X100VI authentication verified (diagnostic connection closed).':bleDiagnostic.detail==='No native Bluetooth authentication test run'?'Native Bluetooth connection failed.':bleDiagnostic.detail));
  return {...bleDiagnostic};
}
async function serve(req,res){if(prohibitedOrigin(req)||['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){json(res,403,{error:'FujiX Wi-Fi bridge is accessible only from this Mac'});return}const pathname=new URL(req.url,'http://127.0.0.1:'+PORT).pathname;
 if(pathname==='/api/recipe-hub/catalog'&&req.method==='GET'){
  try{json(res,200,await recipeHubCatalog())}catch(e){json(res,503,{error:'Could not read original FujiX recipes: '+errorMessage(e)})}return;
 }
 if(pathname==='/api/recipe-hub/staged'&&req.method==='GET'){
  try{json(res,200,await recipeHubStore.list())}catch(e){json(res,503,{error:'Could not read staged recipe library: '+errorMessage(e)})}return;
 }
 if(pathname==='/api/recipe-hub/backup'&&req.method==='GET'){
  try{
   const body=await recipeHubStore.exportBackup();
   const name='FujiX-Sync-Local-Recipes-'+new Date().toISOString().slice(0,10)+'.json';
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),
    'Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(body);
  }catch(e){json(res,503,{error:'Could not export local recipes: '+errorMessage(e)})}
  return;
 }
 if(pathname==='/api/recipe-hub/backup/restore'&&req.method==='POST'){
  try{
   const body=await readBody(req,2*1024*1024+8192);
   if(typeof body?.backup!=='object'||body.backup===null)throw Error('Choose a valid FujiX Sync recipe backup JSON.');
   const apply=body.apply===true;
   const result=await recipeHubStore.restoreBackup(JSON.stringify(body.backup),{dryRun:!apply});
   json(res,200,{ok:true,...result,note:apply?'Merged imported recipes into this Mac only; existing recipes were preserved, and no camera settings changed.':'Preview only: no recipes or camera settings were modified.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/recipe-hub/intake'&&req.method==='POST'){
  try{const body=await readBody(req,4096);json(res,200,await intakeRecipeUrl(body?.url))}
  catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/recipe-hub/staged'&&req.method==='POST'){
  try{const body=await readBody(req,16384);json(res,201,await recipeHubStore.add(body?.recipe))}
  catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 const stagedDelete=/^\/api\/recipe-hub\/staged\/([a-f0-9-]{36})$/.exec(pathname);
 if(stagedDelete&&req.method==='DELETE'){
  try{json(res,200,await recipeHubStore.remove(stagedDelete[1]))}
  catch(e){json(res,404,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/studio/timelapse/status'&&req.method==='GET'){json(res,200,timelapsePublicStatus());return}
 if(pathname==='/api/studio/timelapse/start'&&req.method==='POST'){
  try{json(res,202,await startTimelapseRender(await readBody(req,32768)))}
  catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/timelapse/stop'&&req.method==='POST'){
  if(timelapseJob.running&&timelapseJob.controller){timelapseJob.controller.abort(Error('Time-lapse creation canceled by user. No source file was changed.'));json(res,202,{...timelapsePublicStatus(),cancellationRequested:true})}
  else json(res,200,timelapsePublicStatus());
  return;
 }
 const timelapseMatch=/^\/api\/studio\/timelapse\/file\/(FujiX-Timelapse-\d{8}-\d{6}-[a-f0-9]{8}\.mp4)$/.exec(pathname);
 if(timelapseMatch&&req.method==='GET'){
  if(timelapseJob.status!=='completed'||timelapseMatch[1]!==timelapseJob.outputName){json(res,404,{error:'Time-lapse movie is not available from this session'});return}
  try{
   const target=path.join(TIMELAPSE_DIR,timelapseMatch[1]),stat=await fsp.lstat(target);
   if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==timelapseJob.bytes)throw Error('Time-lapse file changed since rendering');
   res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':stat.size,'Content-Disposition':'attachment; filename="'+timelapseMatch[1]+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   fs.createReadStream(target).pipe(res);
  }catch(e){json(res,404,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/filmkit/capabilities'&&req.method==='GET'){
  json(res,200,{...inspectFilmKitCapabilities(),research:FILMKIT_RESEARCH});return;
 }
 // The USB protocol executes exclusively in the explicitly granted browser WebUSB session.
 // Server only preserves complete raw property backups and verifies disk durability.
 // No endpoint can write a camera setting or claim a camera is connected.
 if(pathname==='/api/studio/camera-presets/backup'&&req.method==='POST'){
  try{
   const body=await readBody(req,128*1024);
   json(res,201,await saveCameraPresetBackup(body?.snapshot,{root:CAMERA_PRESET_BACKUP_DIR}));
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/camera-presets/backup/verify'&&req.method==='GET'){
  try{
   const url=new URL(req.url,'http://127.0.0.1:'+PORT);
   json(res,200,await verifyCameraPresetBackup({root:CAMERA_PRESET_BACKUP_DIR,id:url.searchParams.get('id'),sha256:url.searchParams.get('sha256')}));
  }catch(e){json(res,404,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/image/inspect'&&req.method==='GET'){
  try{
   const id=new URL(req.url,'http://127.0.0.1:'+PORT).searchParams.get('id')||'';
   if(!/^[a-f0-9]{24}$/.test(id))throw Error('Select a valid imported original ID.');
   const library=await localPhotos.list();
   const photo=library.files.find(x=>x.id===id&&x.isOriginal===true);
   if(!photo)throw Error('Camera original is not present in the trusted local library.');
   const inspector=await inspectOfflineImage({root:localPhotos.originals,filename:photo.savedName,maxBytes:200*1024*1024});
   json(res,200,{ok:true,inspection:inspector,note:'Read-only file hash/header inspection, not proof the photo originated on the camera.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/profiles'&&req.method==='GET'){
  try{json(res,200,await offlineProfiles.read())}
  catch(e){json(res,503,{error:'Could not read local profile vault: '+errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/profiles/save'&&req.method==='POST'){
  try{
   const body=await readBody(req,16384);
   const result=await offlineProfiles.saveSlot(body?.slot,{name:body?.name,recipe:body?.recipe,provenance:{type:'manual',description:'Entered by FujiX Sync operator offline; not read from camera.',cameraModel:'X100VI'}});
   json(res,200,{ok:true,...result,note:'Saved local C1–C7 planning recipe only. No camera was connected or modified.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/profiles/import'&&req.method==='POST'){
  try{
   const body=await readBody(req,131072);
   const incoming=typeof body?.backup==='object'?body.backup:body;
   const result=await offlineProfiles.importJSON(JSON.stringify(incoming),{dryRun:body?.apply!==true});
   json(res,200,{ok:true,...result,note:result.applied?'Backup imported to this Mac only; no camera settings changed.':'Preview only. Explicit confirmation required to replace saved profile snapshots.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/multishot/analyze'&&req.method==='POST'){
  try{
   const body=await readBody(req,131072);
   const project=createMultishotProject(body);
   json(res,200,{ok:true,project,contactSheetHtml:createContactSheetHtml(project),note:'Non-destructive analysis only. Grouping by timestamp is a heuristic; review source metadata manually.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/readiness'&&req.method==='GET'){
  try{json(res,200,await inspectOfflineReadiness({photoLibrary:localPhotos,cameraVideo:await macUsbVideoStatus()}))}
  catch(e){json(res,503,{error:'Offline studio status unavailable: '+errorMessage(e)})}
  return;
 }
 if(pathname==='/api/studio/open-app'&&req.method==='POST'){
  try{
   const body=await readBody(req);
   const installedPaths={xraw:'/Applications/FUJIFILM X RAW STUDIO.app',obs:'/Applications/OBS.app'};
   const appPath=installedPaths[body?.app];
   if(!appPath)throw Error('Select the installed X RAW STUDIO or OBS application.');
   if(!(await fsp.stat(appPath)).isDirectory())throw Error('Requested application is not installed.');
   await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-a',appPath],{timeout:10000},error=>error?reject(error):resolve()));
   json(res,200,{ok:true,app:body.app,note:'Launched the installed Mac app at user request; no camera or camera file was modified.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}
  return;
 }
 if(pathname==='/api/usb/originals/watch/status'&&req.method==='GET'){json(res,200,incomingOriginals.status());return}
 if(pathname==='/api/usb/originals/watch/start'&&req.method==='POST'){
  try{json(res,200,await incomingOriginals.start())}catch(e){json(res,409,{error:errorMessage(e),...incomingOriginals.status()})}return;
 }
 if(pathname==='/api/usb/originals/watch/stop'&&req.method==='POST'){json(res,200,await incomingOriginals.stop());return}
 if(pathname==='/api/usb/originals/watch/scan'&&req.method==='POST'){
  try{json(res,200,await incomingOriginals.scan())}catch(e){json(res,409,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/mac/awake'&&req.method==='GET'){json(res,200,macAwake.status());return}
 if(pathname==='/api/mac/awake/start'&&req.method==='POST'){json(res,200,macAwake.start());return}
 if(pathname==='/api/mac/awake/heartbeat'&&req.method==='POST'){json(res,200,macAwake.heartbeat());return}
 if(pathname==='/api/mac/awake/stop'&&req.method==='POST'){json(res,200,macAwake.stop());return}
 if(pathname==='/api/usb/photos'&&req.method==='GET'){
  try{json(res,200,await localPhotos.list())}catch(e){json(res,503,{error:'Could not access Mac photo folders: '+errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/photos/audit/status'&&req.method==='GET'){json(res,200,photoAudit.status());return}
 if(pathname==='/api/usb/photos/audit/start'&&req.method==='POST'){
  try{const body=await readBody(req,512);if(body?.confirm!==true)throw Error('Explicit confirmation is required before scanning the local photo archive.');json(res,202,await photoAudit.start())}
  catch(e){json(res,409,{error:errorMessage(e),...photoAudit.status()})}return;
 }
 if(pathname==='/api/usb/photos/audit/cancel'&&req.method==='POST'){json(res,200,photoAudit.cancel());return}
 if(pathname==='/api/usb/photos/audit/export'&&req.method==='GET'){
  try{
   const receipt=photoAudit.exportReport();
   const name='FujiX-Photo-Archive-Audit-'+new Date().toISOString().slice(0,10)+'.json';
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(receipt),'Content-Disposition':'attachment; filename="'+name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(receipt);
  }catch(e){json(res,409,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/photos/audit/compare'&&req.method==='POST'){
  try{const body=await readBody(req,512*1024);json(res,200,photoAudit.compare(body?.receipt))}
  catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/card-reader/status'&&req.method==='GET'){json(res,200,cardReader.status());return}
 if(pathname==='/api/usb/card-reader/ptp-catalog/status'&&req.method==='GET'){
   try{json(res,200,await ptpCardCatalog.refresh())}
   catch(e){json(res,503,{error:'Could not read native PTP catalog status: '+errorMessage(e)})}
   return;
 }
 if(pathname==='/api/usb/card-reader/ptp-catalog/start'&&req.method==='POST'){
   try{
     const body=await readBody(req,512);
     if(body?.confirm!==true)throw Error('Explicit confirmation is required to enumerate camera file names.');
     if(ptpSelectedImport.status().running)throw Error('Camera imports are running; wait before rescanning.');
     const camera=await macX100viPtpPresence();
     if(!camera.detected)throw Error('Physical Fujifilm USB PTP camera is not detected on this Mac.');
     json(res,202,await ptpCardCatalog.start());
   }catch(e){json(res,409,{...ptpCardCatalog.status(),error:errorMessage(e)})}
   return;
 }
 if(pathname==='/api/usb/card-reader/ptp-import/status'&&req.method==='GET'){
   json(res,200,ptpSelectedImport.status());return;
 }
 if(pathname==='/api/usb/card-reader/ptp-import/start'&&req.method==='POST'){
   try{
     const body=await readBody(req,4096);
     if(body?.confirm!==true)throw Error('Explicit confirmation is required to copy camera originals.');
     if(ptpCardCatalog.status().running)throw Error('Wait for the camera catalog scan to finish first.');
     const camera=await macX100viPtpPresence();
     if(!camera.detected)throw Error('Physical Fujifilm X100VI USB camera is not connected to this Mac.');
     json(res,202,await ptpSelectedImport.start(body?.ids));
   }catch(e){json(res,409,{...ptpSelectedImport.status(),error:errorMessage(e)})}
   return;
 }
 if(pathname==='/api/usb/card-reader/ptp-import/cancel'&&req.method==='POST'){
   try{const body=await readBody(req,512);if(body?.confirm!==true)throw Error('Explicit confirmation is required to stop future camera transfers.');
     json(res,200,ptpSelectedImport.cancel())}
   catch(e){json(res,422,{error:errorMessage(e)})}
   return;
 }
 if(pathname==='/api/usb/card-reader/mounts'&&req.method==='GET'){
  try{json(res,200,{mounts:await cardReader.listMounts(),...cardReader.status()})}
  catch(e){json(res,503,{error:'Could not inspect external card-reader volumes: '+errorMessage(e)})}
  return;
 }
 if(pathname==='/api/usb/card-reader/open-image-capture'&&req.method==='POST'){
  try{
   if(process.platform!=='darwin')throw Error('Image Capture is available only on macOS.');
   await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-a','Image Capture'],{timeout:8000},error=>error?reject(error):resolve()));
   json(res,200,{ok:true,mode:'macos-image-capture',readOnlyLaunch:true,
    note:'Opened native macOS Image Capture on this Mac. Select X100VI in Devices. You can choose and import existing files into Mac storage. FujiX Sync did not download or modify camera originals.'});
  }catch(e){json(res,503,{error:'Could not open native Image Capture: '+errorMessage(e)})}
  return;
 }
 if(pathname==='/api/usb/card-reader/select'&&req.method==='POST'){
  try{const body=await readBody(req,1024);json(res,200,await cardReader.selectMount(body?.name))}
  catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/card-reader/scan'&&req.method==='POST'){
  try{json(res,200,await cardReader.scan())}
  catch(e){json(res,409,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/card-reader/import'&&req.method==='POST'){
  try{
   const body=await readBody(req,16384);
   if(body?.confirm!==true)throw Error('Explicit confirmation is required before importing card files.');
   const result=await cardReader.importFiles(body?.ids);
   json(res,200,{ok:true,...result,note:'Existing JPEG/RAF files copied and checksum-verified into Mac Pictures. SD card and camera settings were not changed.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/photos/capture'&&req.method==='POST'){
  try{
   if(req.headers['content-type']!=='image/jpeg')throw Error('USB video preview must be sent as JPEG.');
   const photo=await localPhotos.write(req,{kind:'capture'});
   json(res,201,{ok:true,photo,note:'Saved a USB live-video JPEG preview in the Mac Pictures folder; this did not trigger the X100VI photographic shutter.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/photos/import'&&req.method==='POST'){
  try{
   const name=new URL(req.url,'http://127.0.0.1:'+PORT).searchParams.get('name')||'';
   if(!name||name.length>128)throw Error('An original photo filename is required.');
   if(req.headers['content-type']!=='application/octet-stream')throw Error('Original photo import requires application/octet-stream.');
   const photo=await localPhotos.write(req,{kind:'original',filename:name});
   json(res,201,{ok:true,photo,note:'Imported exact original file bytes to the Mac; no camera settings or SD card were modified.'});
  }catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 const macPhotoFile=/^\/api\/usb\/photos\/file\/([a-f0-9]{24})$/.exec(pathname);
 if(macPhotoFile&&req.method==='GET'){
  try{
   const {photo,stream,size}=await localPhotos.file(macPhotoFile[1]);
   const preview=new URL(req.url,'http://127.0.0.1:'+PORT).searchParams.get('preview')==='1';
   const filename=photo.name.replace(/[^a-zA-Z0-9._-]/g,'_');
   res.writeHead(200,{'Content-Type':photo.mime,'Content-Length':size,'Content-Disposition':`${preview?'inline':'attachment'}; filename="${filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch(e){json(res,404,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb/photos/reveal'&&req.method==='POST'){
  try{
   await localPhotos.prepare();
   const result=await new Promise((resolve,reject)=>execFile('/usr/bin/open',[localPhotos.root],{timeout:6000},error=>error?reject(error):resolve(true)));
   json(res,200,{ok:result,folder:localPhotos.root});
  }catch(e){json(res,503,{error:'Could not open the Mac photo folder: '+errorMessage(e)})}return;
 }
 if(pathname==='/api/usb-captures'&&req.method==='GET'){
   try{json(res,200,await usbPhotos.list())}catch(e){json(res,503,{error:'Mac USB photo folder cannot be read: '+errorMessage(e)})}return;
 }
 if(pathname==='/api/usb-captures'&&req.method==='POST'){
   if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='image/jpeg'){
     json(res,415,{error:'The native photo gallery only accepts JPEG preview frames.'});return;
   }
   const declared=Number(req.headers['content-length']);
   if(req.headers['content-length'] && (!Number.isSafeInteger(declared)||declared<128||declared>USB_JPEG_MAX_BYTES)){
     json(res,413,{error:'USB preview exceeds the safe 8 MiB photo limit.'});return;
   }
   try{
     const chunks=[];let bytes=0;
     for await(const part of req){bytes+=part.length;if(bytes>USB_JPEG_MAX_BYTES)throw Error('USB preview exceeds safe file limit');chunks.push(part)}
     const saved=await usbPhotos.save(Buffer.concat(chunks,bytes));
     json(res,201,{ok:true,photo:{...saved,url:`/api/usb-captures/${saved.name}`},folder:usbPhotos.folder});
   }catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/usb-captures/open-folder'&&req.method==='POST'){
   try{
     await fsp.mkdir(usbPhotos.folder,{recursive:true,mode:0o700});
     await new Promise((resolve,reject)=>execFile('/usr/bin/open',[usbPhotos.folder],{timeout:5000},error=>error?reject(error):resolve()));
     json(res,200,{ok:true,folder:usbPhotos.folder});
   }catch(e){json(res,503,{error:'Could not open the local camera-photo folder: '+errorMessage(e)})}return;
 }
 const usbPhotoMatch=/^\/api\/usb-captures\/(X100VI-USB-\d{8}-\d{6}-[a-f0-9]{12}\.jpg)$/.exec(pathname);
 if(usbPhotoMatch&&req.method==='GET'){
   try{
     const photo=await usbPhotos.file(usbPhotoMatch[1]);
     res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':photo.bytes,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${photo.name}"`});
     photo.stream.on('error',()=>res.destroy());photo.stream.pipe(res);
   }catch{json(res,404,{error:'Camera preview not found.'})}return;
 }
 if(pathname==='/api/sdk/v1'&&req.method==='GET'){
   const liveVerified=state.status==='live'&&state.verified&&state.frames>0&&Boolean(state.lastFrameAt)&&Date.now()-state.lastFrameAt<5000;
   json(res,200,{
     sdkApiVersion:'1',sdkName:'FujiX SDK',sdkVersion:'0.1.3',model:'X100VI',unofficial:true,
     officialFujifilmSDKCompatible:false,nativeTetherSupported:false,
     features:{
       usbWebcam:{status:'supported',hardwareVerified:false,notes:'X100VI USB WEBCAM is supported by macOS. Verify real frames in the browser; USB webcam is video-only, not RAF tethering.'},
       wifiLiveView:{status:'experimental',hardwareVerified:liveVerified,notes:'Requires authenticated native X100VI PTP/IP session and actual JPEG frames.'},
       wifiShutter:{status:'experimental',hardwareVerified:false,notes:'PTP acknowledgement alone does not confirm a saved photograph.'},
       browserBluetooth:{status:'external-adapter',hardwareVerified:false,notes:'FujiBleShutter browser instance retains its existing user-authorized BLE session.'},
       nativeBluetoothDiagnostic:{status:'diagnostic',hardwareVerified:bleDiagnostic.stage==='authenticated',notes:'Diagnostic handshake is not a persistent camera control session.'},
       photoGallery:{status:'experimental',hardwareVerified:false,notes:'Camera SD gallery mode must be validated separately from live view.'},
       originalAutoTransfer:{status:'experimental',hardwareVerified:false,notes:'Requires validated camera gallery and explicit start; no Frame.io dependency.'},
       tetherInbox:{status:'local-files',hardwareVerified:false,notes:'Local folder workflow, not X100VI USB tether support.'},
       offlineStudio:{status:'available',hardwareVerified:false,notes:'Local-only profile/multishot tools and camera workflow checklist. Not in-camera firmware control.'},
     },
   });return;
 }
 if(pathname==='/api/direct/auto-transfer/status'&&req.method==='GET'){json(res,200,autoTransfer.status());return}
 if(pathname==='/api/local-cloud/status'&&req.method==='GET'){json(res,200,localCloud.status());return}
 if(pathname==='/api/local-cloud/start'&&req.method==='POST'){
   try{
     const lan=await dualNetworkStatus();
     if(!lan.mainWifiIsDefault||!lan.primaryWifiIPv4)throw Error('Connect the Creative Mac to its main home Wi-Fi before starting Local Cloud. No network was changed.');
     json(res,201,await localCloud.start({host:lan.primaryWifiIPv4}));
   }catch(e){json(res,409,{error:errorMessage(e),...localCloud.status()})}return;
 }
 if(pathname==='/api/local-cloud/stop'&&req.method==='POST'){
   try{json(res,200,await localCloud.stop())}catch(e){json(res,500,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/direct/auto-transfer/start'&&req.method==='POST'){
  try{if(state.process||state.status==='connecting'||state.status==='live'||lanAutoTransfer.active||lanAutoTransfer.starting)throw Error('Stop any home-network gallery monitor or direct live view before starting camera-hotspot transfer.');
   json(res,200,await autoTransfer.start())}
  catch(e){json(res,409,{error:errorMessage(e),...autoTransfer.status()})}return;
 }
 if(pathname==='/api/direct/auto-transfer/stop'&&req.method==='POST'){
  json(res,200,await autoTransfer.stop());return;
 }
 if(pathname==='/api/tether/status'&&req.method==='GET'){json(res,200,tetherInbox.status());return}
 if(pathname==='/api/tether/folder'&&req.method==='POST'){
  try{
   if(incomingOriginals.active||incomingOriginals.starting)throw Error('Stop automatic original imports before changing their source folder.');
   const body=await readBody(req);
   const config=await tetherInbox.configure(body.folder);
   const staging=TETHER_SETTINGS+'.'+process.pid+'.tmp';
   await fsp.writeFile(staging,JSON.stringify({folder:config.folder}),{mode:0o600});
   await fsp.rename(staging,TETHER_SETTINGS);
   json(res,200,config);
  }
  catch(e){json(res,422,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/tether/inbox'&&req.method==='GET'){json(res,200,await tetherInbox.scan());return}
 const inboxFileMatch=/^\/api\/tether\/files\/([a-f0-9]{24})$/.exec(pathname);
 if(inboxFileMatch&&req.method==='GET'){
  try{
   const file=await tetherInbox.file(inboxFileMatch[1]);
   const preview=new URL(req.url,'http://127.0.0.1:'+PORT).searchParams.get('preview')==='1';
   const disposition=preview&&['image/jpeg','image/png'].includes(file.mime)?'inline':'attachment';
   const safeName=file.filename.replace(/[^a-zA-Z0-9._-]/g,'_');
   res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`${disposition}; filename="${safeName}"`,'Content-Length':file.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   file.stream.on('error',()=>res.destroy());file.stream.pipe(res);
  }catch(e){json(res,409,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/direct/ble/status'&&req.method==='GET'){
  if(bleDiagnostic.running&&Date.now()-(bleDiagnostic.lastRun||0)>45000){
    bleDiagnostic.running=false;bleDiagnostic.stage='error';
    bleDiagnostic.detail='Bluetooth diagnostic timed out; the X100VI shutter connection was not authenticated.';
  }
  json(res,200,{...bleDiagnostic});return;
 }
 if(pathname==='/api/direct/ble/diagnose'&&req.method==='POST'){
  if(nativeShutter.running){json(res,409,{error:'Camera Bluetooth is busy sending a shutter command'});return}
  try{json(res,202,await testNativeBluetooth())}
  catch(error){bleDiagnostic.running=false;bleDiagnostic.stage='error';
    bleDiagnostic.detail='Native Bluetooth diagnostic failed: '+errorMessage(error);
    json(res,503,{...bleDiagnostic,error:bleDiagnostic.detail})}
  return;
 }
 if(pathname==='/api/direct/ble/shoot/status'&&req.method==='GET'){json(res,200,{...nativeShutter});return}
 if(pathname==='/api/direct/ble/shoot'&&req.method==='POST'){
  const result=fireNativeShutter();
  if(!result){json(res,409,{error:'A Bluetooth camera command is already running. Wait for it to finish.'});return}
  json(res,202,result);return;
 }
 if(pathname==='/api/direct/ble/open-settings'&&req.method==='POST'){try{json(res,200,await openBluetoothSettings())}catch(e){json(res,503,{error:'Could not open macOS Bluetooth settings: '+errorMessage(e)})}return}
 if(pathname==='/api/direct/dual-network/status'&&req.method==='GET'){json(res,200,await dualNetworkStatus());return}
 if(pathname==='/api/direct/status'&&req.method==='GET'){json(res,200,{...status(),network:await cameraNetworkReady()});return}
 if(pathname==='/api/direct/scan'&&req.method==='GET'){try{json(res,200,await scanCameraNetworks())}catch{json(res,503,{ok:false,cameras:[],error:'Could not scan Mac Wi-Fi. Check Wi-Fi and Location Services permissions.'})}return}
 if(pathname==='/api/direct/wifi/permission'&&req.method==='GET'){try{json(res,200,await macWifiPermissionStatus())}catch{json(res,503,{permission:'unavailable'})}return}
 if(pathname==='/api/direct/wifi/authorize'&&req.method==='POST'){try{json(res,200,await requestMacWifiPermission())}catch(e){json(res,503,{error:errorMessage(e)})}return}
 if(pathname==='/api/direct/check'&&req.method==='GET'){json(res,200,{...status(),network:await connectivity()});return}
 if(pathname==='/api/direct/photos'&&req.method==='GET'){
  try{json(res,200,await listCameraPhotos())}catch(e){json(res,409,{verified:false,error:errorMessage(e)})}return;
 }
 const photoMatch=/^\/api\/direct\/photos\/(\d{1,10})$/.exec(pathname);
 if(photoMatch&&req.method==='GET'){
  try{
   const {item,bytes}=await readCameraPhoto(Number(photoMatch[1]));
   const suffix=path.extname(item.name).toLowerCase();
   const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.heif':'image/heif','.heic':'image/heic','.raf':'application/octet-stream','.mov':'video/quicktime','.mp4':'video/mp4'}[suffix]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'X-Original-Filename':item.name,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }catch(e){json(res,409,{error:errorMessage(e)})}return;
 }
 if(pathname==='/api/direct/lan/check'&&req.method==='GET'){
   const requestedIp=new URL(req.url,'http://127.0.0.1:'+PORT).searchParams.get('cameraIp')||'';
   try{await homeLanCameraReady(requestedIp)}catch(e){json(res,422,{reachable:false,error:errorMessage(e)});return}
   const reachable=await probeHost(requestedIp);
   json(res,200,{reachable,cameraIp:requestedIp,ptpPort:FUJI_PORT,verifiedCamera:false,note:reachable?'A PTP/IP socket responded at this address. Fujifilm X100VI identity and live-view support are NOT verified.':'No camera-control PTP/IP service responded at this address. The saved Wireless LAN profile may support Frame.io only.'});return;
 }
 if(pathname==='/api/direct/lan/status'&&req.method==='GET'){
  json(res,200,{cameraIp:lanCamera.host,identityReported:!!lanCamera.host&&Date.now()-lanCamera.identifiedAt<120000,identifiedAt:lanCamera.identifiedAt||null,lastError:lanCamera.lastError,autoTransfer:lanAutoTransfer.status(),cameraDirectUploadVerified:false,note:'This path PULLS camera originals using PTP/IP if the X100VI serves the gallery on the home router. It does not replace the Frame.io upload protocol.'});return;
 }
 if(pathname==='/api/direct/lan/identify'&&req.method==='POST'){
  if(lanAutoTransfer.active||lanAutoTransfer.starting||autoTransfer.active||state.process){json(res,409,{identified:false,error:'Stop any active camera gallery/live-view operation before identifying another host.'});return}
  try{
   const {cameraIp}=await readBody(req);
   await homeLanCameraReady(cameraIp);
   if(!await probeHost(cameraIp))throw Error('No Fujifilm PTP/IP command service on that home-router address; the X100VI may only have outgoing Frame.io access.');
   const bytes=await cameraGalleryHelper(['--host-ip',cameraIp,'--identify'],{binary:path.join(ROOT,'bin','camera-gallery-lan'),timeoutMs:12000});
   const data=JSON.parse(bytes.toString('utf8'));
   if(data.verified!==true||data.model!=='X100VI')throw Error('The host did not report the X100VI protocol identity.');
   lanCamera.host=cameraIp;lanCamera.identifiedAt=Date.now();lanCamera.lastError=null;
   cameraPhotoCache.items=[];cameraPhotoCache.listedAt=0;
   json(res,200,{identified:true,model:data.model,cameraIp,method:data.transport,realPhotoReceived:false,note:'Native Fujifilm PTP/IP setup reported X100VI. Gallery and original download still require a successful independent camera operation.'});
  }catch(e){lanCamera.host=null;lanCamera.identifiedAt=0;lanCamera.lastError=errorMessage(e);json(res,409,{identified:false,error:lanCamera.lastError})}return;
 }
 if(pathname==='/api/direct/lan/auto-transfer/start'&&req.method==='POST'){
  try{
   if(!lanCamera.host||Date.now()-lanCamera.identifiedAt>120000)throw Error('Identify the real X100VI home-network PTP/IP service first.');
   if(autoTransfer.active||autoTransfer.starting||state.process)throw Error('Stop the other camera session before monitoring the LAN gallery.');
   json(res,200,await lanAutoTransfer.start());
  }catch(e){json(res,409,{error:errorMessage(e),...lanAutoTransfer.status()})}return;
 }
 if(pathname==='/api/direct/lan/auto-transfer/stop'&&req.method==='POST'){json(res,200,await lanAutoTransfer.stop());return;}
 if(pathname==='/api/direct/usb/status'&&req.method==='GET'){json(res,200,await macUsbVideoStatus());return}
 if(pathname==='/api/direct/usb/webcam/readiness'&&req.method==='GET'){
  json(res,200,assessUsbWebcamReadiness(await macUsbVideoStatus()));return;
 }
 if(pathname==='/api/direct/usb/ptp/status'&&req.method==='GET'){json(res,200,await macX100viPtpPresence());return}
 if(pathname==='/api/direct/usb/ptp/probe/status'&&req.method==='GET'){json(res,200,{...ptpReadOnlyProbe});return}
 if(pathname==='/api/direct/usb/ptp/vendor/status'&&req.method==='GET'){json(res,200,{...ptpVendorReadOnly});return}
 if(pathname==='/api/direct/usb/ptp/tether-capability/status'&&req.method==='GET'){json(res,200,{...ptpTetherCapability});return}
 if(pathname==='/api/direct/usb/ptp/tether-capability'&&req.method==='POST'){
  try{const result=await runX100viUsbTetherCapabilityProbe();json(res,result.ptpSessionVerified?200:409,result)}
  catch(error){json(res,409,{...ptpTetherCapability,error:errorMessage(error)})}
  return;
 }
 if(pathname==='/api/direct/usb/ptp/vendor'&&req.method==='POST'){
  try{const result=await runX100viVendorReadOnlyProbe();json(res,result.ptpSessionVerified?200:409,result)}
  catch(error){json(res,409,{...ptpVendorReadOnly,error:errorMessage(error)})}
  return;
 }
 if(pathname==='/api/direct/usb/ptp/probe'&&req.method==='POST'){
  try{const result=await runX100viReadOnlyProbe();json(res,result.ptpSessionVerified?200:409,result)}
  catch(error){json(res,409,{...ptpReadOnlyProbe,error:errorMessage(error)})}
  return;
 }
 if(pathname==='/api/direct/join'&&req.method==='POST'){try{const body=await readBody(req);json(res,200,await joinCamera(body))}catch(e){json(res,422,{error:errorMessage(e)})}return}
 if(pathname==='/api/direct/start'&&req.method==='POST'){if(autoTransfer.active||autoTransfer.pending||autoTransfer.starting||lanAutoTransfer.active||lanAutoTransfer.starting){json(res,409,{error:'Stop all camera gallery transfers before starting direct live view. The X100VI gallery and live-view modes cannot be used concurrently.'});return}const n=await connectivity();if(!n.inCameraSubnet||!n.ptpReachable){json(res,409,{error:'No X100VI PTP/IP connection on Mac Wi-Fi. Activate the camera Wi-Fi and join its camera network first.',network:n});return}launchCamera();json(res,202,status());return}
 if(pathname==='/api/direct/shutter'&&req.method==='POST'){const result=await attemptWifiShutter();json(res,result.ok?200:409,result);return}
 if(pathname==='/api/direct/stop'&&req.method==='POST'){killBridge();json(res,200,status());return}
 if(pathname==='/api/direct/snapshot.jpg'&&req.method==='GET'){if(state.status!=='live'||!state.verified||!state.lastFrame){json(res,409,{error:'No verified X100VI Wi-Fi video frame has been received'});return}res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':state.lastFrame.length});res.end(state.lastFrame);return}
 if(pathname==='/api/direct/live.mjpg'&&req.method==='GET'){if(state.status!=='live'||!state.verified||!state.lastFrame){json(res,409,{error:'X100VI native Wi-Fi live stream is not active or no verified video frames arrived',status:state.status,detail:state.detail});return}res.writeHead(200,{'Content-Type':'multipart/x-mixed-replace;boundary=fujixframe','Cache-Control':'no-cache,no-store','X-Content-Type-Options':'nosniff'});state.clients.add(res);if(state.lastFrame){const f=state.lastFrame;res.write(`--fujixframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${f.length}\r\n\r\n`);res.write(f);res.write('\r\n')}res.on('close',()=>state.clients.delete(res));return}
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return}
 // Add a persistent camera-network setup entry point to the existing bundled UI.
 // Inject at serve time: Vite can regenerate web/index.html without removing it.
 if(pathname==='/'||pathname==='/index.html'){
   try{
     const html=await fsp.readFile(path.join(WWW,'index.html'),'utf8');
     const includes='<link rel="stylesheet" href="/wireless-lan-setup.css"><script defer src="/wireless-lan-setup.js?v=3"></script><script type="module" src="/usb-x100vi-assistant.mjs?v=2"></script><script type="module" src="/usb-mac-photos.mjs?v=6"></script><script type="module" src="/supported-workflows.mjs?v=3"></script><link rel="stylesheet" href="/live-shoot-pick.css?v=4"><script type="module" src="/live-shoot-pick.mjs?v=4"></script><link rel="stylesheet" href="/tether-capture.css?v=3"><script type="module" src="/tether-capture.mjs?v=3"></script><link rel="stylesheet" href="/offline-studio.css"><script type="module" src="/offline-studio.mjs?v=2"></script><link rel="stylesheet" href="/library-tools.css?v=2"><script type="module" src="/library-tools.mjs?v=2"></script><link rel="stylesheet" href="/film-lab-nav.css?v=4"><script type="module" src="/film-lab-nav.mjs?v=5"></script>';
     const document=html.includes('</head>')?html.replace('</head>',includes+'</head>'):html+includes;
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
     if(req.method==='HEAD'){res.end();return}
     res.end(document);
   }catch{json(res,503,{error:'FujiX Sync web interface is not installed'})}
   return;
 }
 let asset=decodeURIComponent(pathname==='/'?'/index.html':pathname);
 if(asset==='/film-lab'||asset==='/film-lab/')asset='/film-lab/index.html';
 if(asset==='/lightcraft'||asset==='/lightcraft/')asset='/lightcraft/index.html';
 if(asset.includes('\0')){json(res,400,{error:'Invalid path'});return}
 let full=path.resolve(WWW,'.'+asset);if(full!==WWW&&!full.startsWith(WWW+path.sep)){json(res,403,{error:'Forbidden'});return}
 try{const meta=await fsp.stat(full);if(!meta.isFile())throw Error('not a file');res.writeHead(200,{'Content-Type':contentTypes[path.extname(full).toLowerCase()]||'application/octet-stream','Content-Length':meta.size,'X-Content-Type-Options':'nosniff'});if(req.method==='HEAD'){res.end();return}fs.createReadStream(full).pipe(res)}catch{json(res,404,{error:'Not found'})}
}
const server=http.createServer((req,res)=>{serve(req,res).catch(e=>json(res,500,{error:errorMessage(e)}))});
if(process.argv[1]===fileURLToPath(import.meta.url)){const watchdog=setInterval(()=>{macAwake.expire();if(state.status==='connecting'&&state.startedAt&&Date.now()-state.startedAt>45000){state.status='error';state.detail='Camera PTP/IP connection timed out without verified live view. Confirm camera permission and retry.';killBridge(true)}else if(state.status==='live'&&Date.now()-(state.lastFrameAt||state.startedAt)>20000){state.status='error';state.detail='Camera live view stopped delivering JPEG frames. Reconnect the X100VI Wi-Fi network.';killBridge(true)}},2500);watchdog.unref?.();server.listen(PORT,LISTEN,()=>console.log(`FujiX Sync local Mac direct-WiFi workspace: http://127.0.0.1:${PORT}/?tab=library`));process.on('SIGTERM',()=>{timelapseJob.controller?.abort(Error('FujiX service shutting down'));macAwake.stop();void incomingOriginals.stop();void autoTransfer.stop();void lanAutoTransfer.stop();void localCloud.stop();killBridge();server.close()});process.on('SIGINT',()=>{timelapseJob.controller?.abort(Error('FujiX service shutting down'));macAwake.stop();void incomingOriginals.stop();void autoTransfer.stop();void lanAutoTransfer.stop();void localCloud.stop();killBridge();server.close()})}
export {server, cameraNetworkReady, connectivity, ingestChunk, state, killBridge, isCameraSubnet, isSameLanCameraIp, launchCamera, cameraGalleryHelper, autoTransfer, parseUsbVideoStatus};
