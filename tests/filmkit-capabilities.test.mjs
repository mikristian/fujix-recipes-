import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFilmKitCapabilities,inspectProfileRestore,unavailableFilmKitAdapter,validateFilmKitAdapter,validateFilmKitProfileBackup,FILMKIT_RESEARCH} from '../filmkit-capabilities.mjs';
import {CAMERA_SLOTS,VAULT_FORMAT,VAULT_VERSION} from '../camera-profile-vault.mjs';

const adapter=(overrides={})=>({id:'test-fixture',cameraModel:'X100VI',connected:true,hardwareVerified:true,transport:'webusb-ptp',features:{profileRead:true,profileWrite:true,rawConversion:true},methods:{profileRead:true,profileWrite:true,rawConversion:true},...overrides});
const backup=()=>({format:VAULT_FORMAT,version:VAULT_VERSION,exportedAt:'2026-11-02T19:00:00.000Z',slots:Object.fromEntries(CAMERA_SLOTS.map(slot=>[slot,null]))});
const snapshot={slot:'C1',name:'Hand-copied recipe',capturedAt:'2026-11-02T19:00:00.000Z',recipe:{filmSimulation:'Classic Chrome'},provenance:{type:'manual',description:'Hand-copied from camera menu'}};

test('missing camera reports all operations unavailable and no implied read/write',()=>{
 const status=inspectFilmKitCapabilities();assert.equal(status.status,'camera-not-connected');assert.equal(status.cameraConnected,false);
 for(const value of Object.values(status.capabilities))assert.deepEqual(value.ready,false);
 assert.equal(status.capabilities.rawConversion.reason,'camera-disconnected');
 assert.equal(unavailableFilmKitAdapter().hardwareVerified,false);
});
test('unverified hardware, unknown camera models, and missing individual features fail closed',()=>{
 assert.equal(inspectFilmKitCapabilities(adapter({hardwareVerified:false})).capabilities.profileRead.reason,'hardware-verification-required');
 assert.equal(inspectFilmKitCapabilities(adapter({cameraModel:'X-T5'})).capabilities.profileWrite.reason,'camera-model-unverified');
 assert.equal(inspectFilmKitCapabilities(adapter({methods:{profileRead:true,profileWrite:false,rawConversion:true}})).capabilities.profileWrite.reason,'adapter-method-missing');
 assert.equal(inspectFilmKitCapabilities(adapter({features:{profileRead:true,profileWrite:true,rawConversion:false}})).capabilities.rawConversion.reason,'adapter-feature-unavailable');
});
test('explicit verified adapter is declared ready only for its own feature gates',()=>{
 const status=inspectFilmKitCapabilities(adapter());
 assert.equal(status.capabilities.profileRead.ready,true);assert.equal(status.capabilities.profileWrite.ready,true);
 assert.equal(status.capabilities.rawConversion.ready,true);
 assert.equal(status.capabilities.profileWrite.contractMethod,'writeProfile');
});
test('rejects malformed and embellished adapters',()=>{
 for(const data of [null,{},adapter({connected:'yes'}),adapter({features:{profileRead:true,profileWrite:true}}),adapter({extra:'unexpected'}),adapter({hardwareVerified:true,connected:false}),adapter({cameraModel:'X100VI\nunsafe'})]){
  assert.throws(()=>validateFilmKitAdapter(data),TypeError);
 }
});
test('archive validation requires offline vault JSON schema and C1–C7 slot matching',()=>{
 const data=backup();data.slots.C1=snapshot;
 assert.equal(validateFilmKitProfileBackup(data).slots.C1.recipe.filmSimulation,'Classic Chrome');
 assert.throws(()=>validateFilmKitProfileBackup({...data,format:'camera-binary'}));
 assert.throws(()=>validateFilmKitProfileBackup({...data,slots:{C2:snapshot}}),/mismatch/);
 assert.throws(()=>validateFilmKitProfileBackup({...data,slots:{C1:{...snapshot,nativeProfileBinary:'AAAA'}}}),/Unknown snapshot field/);
});
test('restore is preview-only and shows disconnection, empty backup and gated write',()=>{
 const data=backup();data.slots.C1=snapshot;
 const missing=inspectProfileRestore(data);assert.equal(missing.cameraWriteReady,false);assert.equal(missing.reason,'camera-disconnected');assert.deepEqual(missing.slots,['C1']);
 const empty=inspectProfileRestore(backup(),adapter());assert.equal(empty.reason,'backup-empty');assert.equal(empty.cameraWriteReady,false);
 const connected=inspectProfileRestore(data,adapter());assert.equal(connected.cameraWriteReady,true);
 assert.equal(data.slots.C1.recipe.filmSimulation,'Classic Chrome');
});
test('FilmKit reference accurately records project distinction',()=>{
 assert.equal(FILMKIT_RESEARCH.documentedModel,'X100VI');assert.match(FILMKIT_RESEARCH.repository,/eggricesoy\/filmkit/);
});
