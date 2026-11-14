/** FilmKit research-derived capability gates. Pure metadata; no PTP or USB I/O. */
import {CAMERA_SLOTS,validateBackup} from './camera-profile-vault.mjs';

export const FILMKIT_RESEARCH=Object.freeze({
 repository:'https://github.com/eggricesoy/filmkit',
 reference:'https://github.com/eggricesoy/filmkit/blob/master/QUICK_REFERENCE.md',
 documentedModel:'X100VI',
 transport:'WebUSB / PTP',
 evidence:'FilmKit README says X100VI tested in FilmKit beta; not verified in FujiX Sync',
 notes:'FilmKit documents C1–C7 property operations (D18C, D18D and D18E–D1A5) and camera-side RAF-to-JPEG conversion. These are research notes, not callable adapter APIs.',
});

export const FILMKIT_FEATURES=Object.freeze(['profileRead','profileWrite','rawConversion']);
const FEATURE_METHODS=Object.freeze({profileRead:'readProfiles',profileWrite:'writeProfile',rawConversion:'convertRaw'});
const defined=(value)=>value!==undefined;
const plain=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const fail=(message)=>{throw new TypeError(message)};
const checkText=(value,max=160)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);

/**
 * Adapter metadata, intentionally independent of any driver implementation.
 * `supported` is an adapter declaration only, never evidence of hardware proof.
 * Supported feature names describe integration contracts, not FilmKit exports.
 */
export function validateFilmKitAdapter(adapter){
 if(!plain(adapter))fail('Adapter description must be a plain object');
 const allowed=['id','cameraModel','connected','transport','features','methods','hardwareVerified'];
 if(Object.keys(adapter).some(k=>!allowed.includes(k)))fail('Unexpected adapter metadata');
 if(!checkText(adapter.id)||!checkText(adapter.cameraModel))fail('Invalid adapter identity');
 if(typeof adapter.connected!=='boolean')fail('Connected must be boolean');
 if(adapter.transport!=='webusb-ptp'&&adapter.transport!=='native-ptp')fail('Unsupported adapter transport');
 if(!plain(adapter.features)||Object.keys(adapter.features).some(k=>!FILMKIT_FEATURES.includes(k)))fail('Invalid feature map');
 for(const feature of FILMKIT_FEATURES)if(typeof adapter.features[feature]!=='boolean')fail('Each feature needs an explicit boolean');
 if(!plain(adapter.methods)||Object.keys(adapter.methods).some(k=>!FILMKIT_FEATURES.includes(k)))fail('Invalid method availability map');
 for(const feature of FILMKIT_FEATURES)if(typeof adapter.methods[feature]!=='boolean')fail('Each method needs explicit availability');
 if(typeof adapter.hardwareVerified!=='boolean')fail('Hardware verification flag is required');
 if(adapter.hardwareVerified&&!adapter.connected)fail('Disconnected adapter cannot claim active hardware verification');
 return Object.freeze({id:adapter.id,cameraModel:adapter.cameraModel,connected:adapter.connected,transport:adapter.transport,hardwareVerified:adapter.hardwareVerified,features:Object.freeze({...adapter.features}),methods:Object.freeze({...adapter.methods})});
}

/** Safe default for missing camera or unimplemented hardware integration. */
export function unavailableFilmKitAdapter(){
 return validateFilmKitAdapter({id:'unconnected',cameraModel:'X100VI',connected:false,transport:'webusb-ptp',hardwareVerified:false,
  features:{profileRead:false,profileWrite:false,rawConversion:false},
  methods:{profileRead:false,profileWrite:false,rawConversion:false}});
}

/**
 * Returns informational gate results. Never invokes adapter methods or accesses USB.
 * A feature is ready only with connected, model-matched, hardware-verified adapter
 * that explicitly declares both support and an implementation for that feature.
 */
export function inspectFilmKitCapabilities(adapter=unavailableFilmKitAdapter()){
 const a=validateFilmKitAdapter(adapter);
 const modelMatch=a.cameraModel==='X100VI';
 const capabilities={};
 for(const feature of FILMKIT_FEATURES){
  let reason;
  if(!a.connected)reason='camera-disconnected';
  else if(!modelMatch)reason='camera-model-unverified';
  else if(!a.features[feature])reason='adapter-feature-unavailable';
  else if(!a.methods[feature])reason='adapter-method-missing';
  else if(!a.hardwareVerified)reason='hardware-verification-required';
  else reason='adapter-declared-ready';
  capabilities[feature]={ready:reason==='adapter-declared-ready',reason,contractMethod:FEATURE_METHODS[feature]};
 }
 return {cameraConnected:a.connected,hardwareVerified:a.hardwareVerified,model:a.cameraModel,transport:a.transport,capabilities,
  status:a.connected?'adapter-reported-camera-connected':'camera-not-connected',
  note:'Adapter declarations are not independent camera verification. No USB operation or camera setting write is performed.'};
}

/** Archive accepted as a strictly typed local recipe backup; no binary camera payload. */
export function validateFilmKitProfileBackup(backup){
 const validated=validateBackup(backup);
 if(!CAMERA_SLOTS.every(slot=>Object.hasOwn(validated.slots,slot)))fail('Missing custom slots');
 return validated;
}

export function inspectProfileRestore(backup,adapter=unavailableFilmKitAdapter()){
 const validated=validateFilmKitProfileBackup(backup);
 const status=inspectFilmKitCapabilities(adapter);
 const filledSlots=CAMERA_SLOTS.filter(slot=>validated.slots[slot]!==null);
 return {backupValid:true,slots:filledSlots,hasProfiles:filledSlots.length>0,
  cameraWriteReady:status.capabilities.profileWrite.ready&&filledSlots.length>0,
  reason:filledSlots.length===0?'backup-empty':status.capabilities.profileWrite.reason,
  note:'This preview does not restore profiles or construct any native camera profile bytes.'};
}
