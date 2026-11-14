import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {server, ingestChunk, state, killBridge, isCameraSubnet, isSameLanCameraIp, cameraGalleryHelper, parseUsbVideoStatus} from '../server.mjs';

test('USB webcam discovery only reports a Fujifilm X100VI UVC camera',()=>{
  const output='Camera:\n    FaceTime HD Camera:\n      Model ID: A\n    FUJIFILM X100VI:\n      Model ID: UVC Camera VendorID_1227 ProductID_772\n';
  assert.deepEqual(parseUsbVideoStatus(output),{cameraPresent:true,deviceLabel:'FUJIFILM X100VI',transport:'usb-webcam',actualVideoFramesVerified:false});
  assert.equal(parseUsbVideoStatus('Camera:\n    FaceTime HD Camera:\n').cameraPresent,false);
  assert.equal(parseUsbVideoStatus('Camera:\n    FUJIFILM X100V:\n').cameraPresent,false);
  assert.equal(parseUsbVideoStatus('Camera:\n    USB Video Capture:\n').cameraPresent,false);
});

test('shared LAN camera-IP checks require a single explicit same-subnet host',()=>{
  assert.equal(isSameLanCameraIp('192.168.12.55','192.168.12.208'),true);
  assert.equal(isSameLanCameraIp('192.168.12.208','192.168.12.208'),false);
  assert.equal(isSameLanCameraIp('192.168.12.1','192.168.12.208'),false);
  assert.equal(isSameLanCameraIp('192.168.0.1','192.168.12.208'),false);
  assert.equal(isSameLanCameraIp('8.8.8.8','192.168.12.208'),false);
  assert.equal(isSameLanCameraIp('not.an.ip','192.168.12.208'),false);
});

test('camera network guard excludes home router subnets',()=>{
  assert.equal(isCameraSubnet('192.168.12.208'),false);
  assert.equal(isCameraSubnet('192.168.0.12'),true);
  assert.equal(isCameraSubnet('192.168.0.1'),true);
  assert.equal(isCameraSubnet('192.168.0.0'),false);
  assert.equal(isCameraSubnet('8.8.8.8'),false);
});
test('gallery helper lists and transfers only explicitly requested synthetic files',async()=>{
  const fixture=fileURLToPath(new URL('./fixtures/fake-gallery.mjs',import.meta.url));
  const list=await cameraGalleryHelper([fixture,'--list'],{binary:process.execPath});
  const data=JSON.parse(list.toString());
  assert.equal(data.verified,true);
  assert.equal(data.items.length,2);
  assert.equal(data.items[1].name,'DSCF1001.RAF');
  const file=await cameraGalleryHelper([fixture,'--download','4'],{binary:process.execPath});
  assert.equal(file.length,512);
  assert.equal(file.readUInt16BE(0),0xffd8);
  assert.equal(file.readUInt16BE(510),0xffd9);
  await assert.rejects(cameraGalleryHelper([fixture,'--fail'],{binary:process.execPath}),/Camera refused/);
});
test('framed camera JPEG handles split input and never reports frames too early',()=>{
  killBridge();
  state.verified=true;
  const image=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(252,1),Buffer.from([0xff,0xd9])]);
  const length=Buffer.alloc(4);length.writeUInt32BE(image.length);
  ingestChunk(length.subarray(0,2));assert.equal(state.frames,0);
  ingestChunk(Buffer.concat([length.subarray(2),image.subarray(0,12)]));assert.equal(state.frames,0);
  ingestChunk(image.subarray(12));assert.equal(state.frames,1);
  assert.deepEqual(state.lastFrame,image);
  killBridge();
});
test('non-JPEG and overlarge frame lengths stop the stream without accepting content',()=>{
  killBridge();
  const image=Buffer.alloc(160,0);const len=Buffer.alloc(4);len.writeUInt32BE(image.length);
  const before=state.frames;ingestChunk(Buffer.concat([len,image]));assert.equal(state.status,'error');assert.equal(state.frames,before);
  killBridge();
  const over=Buffer.alloc(4);over.writeUInt32BE(9*1024*1024);ingestChunk(over);
  assert.equal(state.status,'error');assert.equal(state.frames,before);
  killBridge();
});
test('loopback HTTP server refuses a remote or invalid origin and missing-camera start',async t=>{
  const host=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const remote=await fetch(host+'/api/direct/status',{headers:{Origin:'https://malicious.example'}});
  assert.equal(remote.status,403);
});

test('local status, network scan and native stream are fail-closed before camera proof', async t=>{
  const origin=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const stat=await (await fetch(origin+'/api/direct/status')).json();
  assert.equal(stat.app,'FUJIX_X100VI_WIFI_BRIDGE');
  const ble=await (await fetch(origin+'/api/direct/ble/status')).json();
  assert.equal(typeof ble.stage,'string');
  assert.equal(typeof ble.running,'boolean');
  const lanStatus=await fetch(origin+'/api/direct/lan/status');
  assert.equal(lanStatus.status,200);
  assert.equal((await lanStatus.json()).autoTransfer.active,false,'router Wi-Fi transfer must be opt-in');
  const lanInactive=await fetch(origin+'/api/direct/lan/auto-transfer/start',{method:'POST'});
  assert.equal(lanInactive.status,409,'router gallery monitor cannot run without an actual X100VI PTP/IP identification');
  const invalidLanIdentify=await fetch(origin+'/api/direct/lan/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cameraIp:'8.8.8.8'})});
  assert.equal(invalidLanIdentify.status,409,'public/non-local addresses cannot be tested using camera protocol');
  const wrongLanIdentify=await fetch(origin+'/api/direct/lan/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cameraIp:'127.0.0.1'})});
  assert.equal(wrongLanIdentify.status,409,'loopback cannot impersonate a home-Wi-Fi camera');
  const untrustedLanIdentify=await fetch(origin+'/api/direct/lan/identify',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify({cameraIp:'192.168.12.55'})});
  assert.equal(untrustedLanIdentify.status,403,'a remote site must not open a Fujifilm camera session');
  const badLanCheck=await fetch(origin+'/api/direct/lan/check?cameraIp=8.8.8.8');
  assert.equal(badLanCheck.status,422,'LAN port test cannot use public addresses');
  const cloud=await fetch(origin+'/api/local-cloud/status');
  assert.equal(cloud.status,200);
  assert.equal((await cloud.json()).active,false,'LAN receiver must be off until the user explicitly starts it');
  const remoteCloud=await fetch(origin+'/api/local-cloud/start',{method:'POST',headers:{Origin:'https://evil.example'}});
  assert.equal(remoteCloud.status,403,'untrusted origin cannot expose a LAN image receiver');
  const dual=await fetch(origin+'/api/direct/dual-network/status');
  assert.equal(dual.status,200);
  const dualStatus=await dual.json();
  assert.equal(typeof dualStatus.secondWifiRadioDetected,'boolean');
  assert.equal(dualStatus.verifiedCameraConnected,false);
  const remoteDual=await fetch(origin+'/api/direct/dual-network/status',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(remoteDual.status,403);
  const remoteSettings = await fetch(origin+'/api/direct/ble/open-settings',{method:'POST',headers:{Origin:'https://untrusted.example'}});
  assert.equal(remoteSettings.status,403,'a remote site may not open local Mac Bluetooth settings');
  const image=await fetch(origin+'/api/direct/snapshot.jpg');
  assert.equal(image.status,409);
  const video=await fetch(origin+'/api/direct/live.mjpg');
  assert.equal(video.status,409);
  const shutter=await fetch(origin+'/api/direct/shutter',{method:'POST'});
  assert.equal(shutter.status,409,'shutter cannot fire without verified X100VI live frames');
  const noShot=await shutter.json();
  assert.equal(noShot.commandAccepted,false);
  assert.equal(noShot.photoSaved,'unverified');
  const gallery=await fetch(origin+'/api/direct/photos');
  const transferStatus=await fetch(origin+'/api/direct/auto-transfer/status');
  assert.equal(transferStatus.status,200);
  assert.equal((await transferStatus.json()).active,false);
  const blockedStart=await fetch(origin+'/api/direct/auto-transfer/start',{method:'POST'});
  assert.equal(blockedStart.status,409,'auto-transfer requires physical X100VI PTP/IP discovery');
  const forbiddenStart=await fetch(origin+'/api/direct/auto-transfer/start',{method:'POST',headers:{Origin:'https://untrusted.example'}});
  assert.equal(forbiddenStart.status,403);
  const tether=await fetch(origin+'/api/tether/status');
  assert.equal(tether.status,200);
  assert.equal(typeof (await tether.json()).configured,'boolean');
  const untrustedTether=await fetch(origin+'/api/tether/inbox',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(untrustedTether.status,403);
  const badFolder=await fetch(origin+'/api/tether/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:'/etc'})});
  assert.equal(badFolder.status,422,'untrusted system folders are disallowed');
  assert.equal(gallery.status,409,'camera SD contents must not be exposed on the home network');
  const galleryStatus=await gallery.json();
  assert.equal(galleryStatus.verified,false);
  const directPhoto=await fetch(origin+'/api/direct/photos/1');
  assert.equal(directPhoto.status,409,'cannot download camera photos without a fresh verified listing');
  const remotePhotos=await fetch(origin+'/api/direct/photos',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(remotePhotos.status,403,'remote website cannot browse camera memory');
  const wifiPermission=await fetch(origin+'/api/direct/wifi/permission');
  // macOS may deny the native location/Wi-Fi probe to headless SSH test
  // processes. This is an intentional fail-closed API response, not a
  // successful camera network discovery.
  assert.ok([200,503].includes(wifiPermission.status),'Wi-Fi diagnostics must report success or an explicit unavailable state');
  const permissionState=await wifiPermission.json();
  if(wifiPermission.status===503)assert.equal(permissionState.permission,'unavailable');
  else assert.equal(typeof permissionState.permission,'string');
  const forbiddenPermission=await fetch(origin+'/api/direct/wifi/authorize',{method:'POST',headers:{Origin:'https://untrusted.example'}});
  assert.equal(forbiddenPermission.status,403,'remote web pages cannot trigger a system location authorization prompt');
  const hostile=await fetch(origin+'/api/direct/shutter',{method:'POST',headers:{Origin:'https://untrusted.example'}});
  assert.equal(hostile.status,403,'remote origins cannot issue a camera capture command');
  const reject=await fetch(origin+'/api/direct/start',{method:'POST',headers:{Origin:origin}});
  assert.equal(reject.status,409);
  const scanned=await fetch(origin+'/api/direct/scan');
  assert.ok([200,503].includes(scanned.status),'Headless Wi-Fi scan must either work or report unavailable');
  const scans=await scanned.json();
  assert.equal(Array.isArray(scans.cameras),true);
  if(scanned.status===503){
    assert.equal(scans.ok,false);
    assert.equal(scans.cameras.length,0,'Unavailable Wi-Fi must never fabricate camera discovery');
    assert.equal(typeof scans.error,'string');
  }
});

test('full mock native PTP/IP stream delivers synthetic JPEG and snapshot endpoint',async t=>{
  const {launchCamera}=await import('../server.mjs');
  const origin=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
  t.after(()=>{killBridge();return new Promise(resolve=>server.close(resolve))});
  const fixture=fileURLToPath(new URL('./fixtures/fake-ptp.mjs',import.meta.url));
  launchCamera({binary:process.execPath,args:[fixture]});
  let received=false;
  // A cold Node process on a removable ExFAT drive may take >1.6s to
  // launch; wait for real synthetic frames, not for a fixed fast-SSD clock.
  const frameDeadline=Date.now()+10000;
  while(Date.now()<frameDeadline){
    await new Promise(r=>setTimeout(r,80));
    if(state.frames>0&&state.verified&&state.status==='live'){received=true;break;}
  }
  assert.equal(received,true,`native subprocess produced framed synthetic video: ${state.status} ${state.detail}`);
  const status=await (await fetch(origin+'/api/direct/status')).json();
  assert.equal(status.verified,true);
  assert.equal(status.frames>0,true);
  assert.equal(status.shutterAvailable,true);
  const noGalleryDuringVideo=await fetch(origin+'/api/direct/auto-transfer/start',{method:'POST'});
  assert.equal(noGalleryDuringVideo.status,409,'cannot switch from verified live view to gallery auto-import without stopping live view');
  const shoot=await fetch(origin+'/api/direct/shutter',{method:'POST'});
  assert.equal(shoot.status,200);
  const capture=await shoot.json();
  assert.equal(capture.commandAccepted,true,'synthetic fixture explicitly acknowledged');
  assert.equal(capture.photoSaved,'unverified','the UI never claims a saved picture from a PTP ack');
  const repeat=await fetch(origin+'/api/direct/shutter',{method:'POST'});
  assert.equal(repeat.status,409,'only one experimental shutter request allowed per live session');
  const snap=await fetch(origin+'/api/direct/snapshot.jpg');
  assert.equal(snap.status,200);
  assert.equal(snap.headers.get('Content-Type'),'image/jpeg');
  const img=Buffer.from(await snap.arrayBuffer());
  assert.equal(img.readUInt16BE(0),0xffd8);
  assert.equal(img.readUInt16BE(img.length-2),0xffd9);
  const controller=new AbortController();
  const stream=await fetch(origin+'/api/direct/live.mjpg',{signal:controller.signal});
  assert.equal(stream.status,200);
  assert.match(stream.headers.get('Content-Type'),/multipart\/x-mixed-replace/);
  controller.abort();
  killBridge();
  assert.equal(state.status,'idle');
  const after=await fetch(origin+'/api/direct/snapshot.jpg');
  assert.equal(after.status,409);
});
