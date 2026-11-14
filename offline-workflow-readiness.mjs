/** Honest, offline-capable X100VI workflow registry.
 * This reports computer-side capabilities. It never discovers/claims a camera,
 * modifies camera firmware, writes camera settings or fires the shutter.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_APPS={
  xRawStudio:'/Applications/FUJIFILM X RAW STUDIO.app',
  obs:'/Applications/OBS.app',
  touchDesigner:'/Applications/TouchDesigner.app',
};

export const CAMERA_MODES=Object.freeze([
  {id:'usb-webcam',title:'Live USB preview',cameraMode:'USB WEBCAM',canImportOriginal:false,description:'1920×1080 video previews, not 40MP RAW photographic stills.'},
  {id:'card-reader',title:'Import camera originals',cameraMode:'USB CARD READER',canImportOriginal:true,description:'Copy already-recorded RAF/JPEG originals using Image Capture, then import into FujiX Sync.'},
  {id:'raw-conversion',title:'Native Fujifilm RAW processing',cameraMode:'USB RAW CONV./BACKUP RESTORE',canImportOriginal:false,description:'Use the camera processor with X RAW STUDIO. First hardware RAW conversion not verified in FujiX Sync.'},
  {id:'wifi-xapp',title:'Phone remote and optional transfers',cameraMode:'Bluetooth / Wi-Fi',canImportOriginal:false,description:'XApp mobile remote shooting and supported file transfers; native Mac gallery not camera-validated.'},
]);

export async function inspectOfflineReadiness({apps=DEFAULT_APPS,photoLibrary,home=os.homedir(),cameraVideo={}}={}){
  const installed={};
  for(const [id,location] of Object.entries(apps)){
    try{installed[id]=(await fsp.stat(location)).isDirectory()}catch{installed[id]=false}
  }
  const photos=photoLibrary?await photoLibrary.list():{files:[],folder:path.join(home,'Pictures','FujiX Sync')};
  const files=photos.files||[];
  const originals=files.filter(file=>file.isOriginal===true);
  const previews=files.filter(file=>file.kind==='usb-preview');
  const raf=originals.filter(file=>/\.raf$/i.test(file.name));
  const incoming=path.join(home,'Pictures','FujiX Sync Incoming');
  let pending=0;
  try{
    for(const entry of await fsp.readdir(incoming,{withFileTypes:true})){
      if(entry.isFile()&&!entry.isSymbolicLink()&&/\.(?:raf|jpe?g|heif|heic|png|tiff?)$/i.test(entry.name))pending++;
    }
  }catch(error){if(error.code!=='ENOENT')throw error}
  return {
    app:'FujiX Sync Offline Studio',model:'X100VI',cameraRequired:false,
    checkedAt:new Date().toISOString(),installed,
    library:{originalCount:originals.length,rafCount:raf.length,usbPreviewCount:previews.length,incomingFileCount:pending,folder:photos.folder,source:'local-library-files'},
    usbCamera:{enumerated:cameraVideo.cameraPresent===true,liveFramesVerified:false},
    firmwareModified:false,
    nativeUsbTetherSupported:false,
    fullResolutionCaptureVerified:false,
    recipesOnCameraVerified:false,
    modes:CAMERA_MODES,
    nextSteps:[
      {id:'originals',title:'Import genuine RAF/JPEG',offlineReady:true,hardwareStepRequired:true},
      {id:'film-lab',title:'Film profile archive and comparison',offlineReady:true,hardwareStepRequired:false},
      {id:'xraw',title:'Use X RAW STUDIO with camera',offlineReady:installed.xRawStudio===true,hardwareStepRequired:true},
      {id:'multishot',title:'Bracket and time-lapse project planning',offlineReady:true,hardwareStepRequired:false},
    ],
  };
}
