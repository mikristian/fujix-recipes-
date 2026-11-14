import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUsbWebcamReadiness} from '../usb-webcam-readiness.mjs';

test('enumerated real Fujifilm USB video input is only connection-ready, never photographic capture',()=>{
 const status=assessUsbWebcamReadiness({available:true,cameraPresent:true,deviceLabel:'FUJIFILM X100VI',transport:'usb-webcam',actualVideoFramesVerified:false});
 assert.equal(status.connected,true);
 assert.equal(status.status,'usb_camera_detected');
 assert.equal(status.detectionOnly,true);
 assert.equal(status.browserFramesVerified,false);
 assert.equal(status.photographicShutterAvailable,false);
 assert.equal(status.originalJpegRafTransferAvailable,false);
 assert.match(status.note,/different camera modes/);
});
test('PTP-only or lookalike cameras cannot count as UVC X100VI',()=>{
 for(const inventory of [
  {cameraPresent:true,deviceLabel:'FUJIFILM X100VI',transport:'usb-ptp'},
  {cameraPresent:true,deviceLabel:'X100V',transport:'usb-webcam'},
  {cameraPresent:true,deviceLabel:'iPhone Camera',transport:'usb-webcam'},
  {cameraPresent:false,deviceLabel:'FUJIFILM X100VI',transport:'usb-webcam'},
  {},
 ]) {
  const status=assessUsbWebcamReadiness(inventory);
  assert.equal(status.connected,false);
  assert.equal(status.browserFramesVerified,false);
  assert.equal(status.photographicShutterAvailable,false);
 }
});
test('camera profiler failure reports uncertainty instead of asserting disconnected',()=>{
 const status=assessUsbWebcamReadiness({available:false,cameraPresent:false});
 assert.equal(status.status,'enumeration_unavailable');
 assert.equal(status.connected,false);
 assert.equal(status.requiredConnectionMode,'USB WEBCAM');
 assert.equal(status.steps.length,3);
});
