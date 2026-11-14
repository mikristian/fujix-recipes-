import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretX100viPtpReadonlyProbe} from '../usb-ptp-probe-result.mjs';

const realReply=[
  'ImageCaptureCore detected X100VI USB VID=0x04CB PID=0x0305',
  'PTP response=12 bytes; DeviceInfo payload=369 bytes',
  'PTP response code=0x2001',
  'Camera-advertised PTP operations (20):',
  'Capture indicators: InitiateCapture(0x100E)=NO InitiateOpenCapture(0x101C)=NO Fuji-901B=NO GetCapturePreview(0x9022)=NO',
].join('\n');
test('a real read-only X100VI reply verifies a session, never a shutter',()=>{
  const state=interpretX100viPtpReadonlyProbe(realReply,0);
  assert.equal(state.ptpSessionVerified,true);
  assert.equal(state.standardCaptureAdvertised,false);
  assert.equal(state.capturePreviewAdvertised,false);
  assert.equal(state.shutterAttempted,false);
  assert.equal(state.shutterAvailable,false);
  assert.equal(state.photoSaved,'unverified');
  assert.equal(state.firmwareChanged,false);
  assert.equal(state.cameraSettingsChanged,false);
});
test('stray success text, a different camera, or failed process cannot fake a session',()=>{
  assert.equal(interpretX100viPtpReadonlyProbe('PTP response code=0x2001',0).ptpSessionVerified,false);
  assert.equal(interpretX100viPtpReadonlyProbe(realReply.replace('0x0305','0x041e'),0).ptpSessionVerified,false);
  assert.equal(interpretX100viPtpReadonlyProbe(realReply,2).ptpSessionVerified,false);
  assert.equal(interpretX100viPtpReadonlyProbe('Probe timeout. The physical X100VI may be busy',2).ptpSessionVerified,false);
  assert.match(interpretX100viPtpReadonlyProbe('Probe timeout',2).detail,/power off and reconnect/);
});
