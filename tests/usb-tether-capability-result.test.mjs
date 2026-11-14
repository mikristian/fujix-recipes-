import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretX100viUsbTetherCapability} from '../usb-tether-capability-result.mjs';

const observed=[
  'X100VI_USB_MATCH: vendor=0x04CB product=0x0305',
  'PTP 0x1001 -> 0x2001 (369 data bytes)',
  'CAPTURE_OPCODE_ADVERTISED: no',
  'OPEN_CAPTURE_OPCODE_ADVERTISED: no',
  'FUJI_CAPTURE_PREVIEW_OPCODE_ADVERTISED: no',
  'PTP 0x1015 -> 0x2001 (2 data bytes)',
  'USB_MODE_D16E: 6',
  'USB_TETHER_MODE_ACTIVE: no',
  'PTP 0x1004 -> 0x2001 (12 data bytes)',
  'STORAGE_IDS_COUNT: 2',
  'PTP 0x1005 -> 0x2001 (104 data bytes)',
  'STORAGE_INFO: id=0x10000001 type=3 filesystem=2 access=2 max=18446744073709551615 free=18446744073709551615 freeImages=4294967295 category=Still',
  'PTP 0x1005 -> 0x2001 (102 data bytes)',
  'STORAGE_INFO: id=0x10000002 type=3 filesystem=2 access=2 max=18446744073709551615 free=18446744073709551615 freeImages=4294967295 category=Live',
  'STORAGE_ENUM_COMPLETE: yes',
  'TETHER_CAPTURE_VERIFIED: no',
].join('\n');

test('physical read-only X100VI USB-C storage result cannot imply capture',()=>{
  const result=interpretX100viUsbTetherCapability(observed,0);
  assert.equal(result.ptpSessionVerified,true);
  assert.equal(result.usbMode,6);
  assert.equal(result.standardCaptureAdvertised,false);
  assert.equal(result.openCaptureAdvertised,false);
  assert.equal(result.capturePreviewAdvertised,false);
  assert.equal(result.advertisedStorageCount,2);
  assert.equal(result.onlyFixedRamStoragesAdvertised,true);
  assert.equal(result.normalSdCardStorageObserved,false);
  assert.equal(result.usbPhotographicCaptureVerified,false);
  assert.equal(result.shutterAvailable,false);
  assert.equal(result.photoSaved,'unverified');
});
test('reject missing requests, fake camera, nonzero exit and incomplete stores',()=>{
  for(const text of [
    observed.replace('0x0305','0x0306'),
    observed.replace('STORAGE_ENUM_COMPLETE: yes','STORAGE_ENUM_COMPLETE: no'),
    observed.replace('STORAGE_IDS_COUNT: 2','STORAGE_IDS_COUNT: 3'),
    observed.replace('PTP 0x1005 -> 0x2001','PTP 0x1005 -> 0x2002'),
  ])assert.equal(interpretX100viUsbTetherCapability(text,0).ptpSessionVerified,false);
  assert.equal(interpretX100viUsbTetherCapability(observed,2).ptpSessionVerified,false);
  assert.doesNotMatch(JSON.stringify(interpretX100viUsbTetherCapability(observed+'\nSerial: private_serial',0)),/private_serial/);
});
