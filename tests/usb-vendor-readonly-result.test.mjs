import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretX100viVendorReadonlyResult} from '../usb-vendor-readonly-result.mjs';

const fixture=[
  'ImageCaptureCore detected X100VI USB VID=0x04CB PID=0x0305',
  'PTP response code=0x2001',
  'READ-ONLY QUERY: USBMode (0xD16E)',
  '  Callback bytes: data=2 reply=12',
  '  PTP response=0x2001, data=2 bytes',
  '  Read-only property value=0x6 (6)',
  'READ-ONLY QUERY: TetherRawConditionCode (0xD186)',
  '  PTP response=0x2001, data=25 bytes',
  'READ-ONLY QUERY: TetherRawCompatibilityCode (0xD187)',
  '  PTP response=0x2001, data=25 bytes',
  'READ-ONLY QUERY: Fujifilm device property (0xD208, meaning unverified)',
  '  PTP response=0x2001, data=2 bytes',
  '  Read-only property value=0x304 (772)',
  'READ-ONLY QUERY: CurrentState (0xD212)',
  '  PTP response=0x2001, data=2 bytes',
  '  Read-only property value=0x0 (0)',
  'Completed all whitelisted read-only Fuji queries.',
].join('\n');

test('X100VI live five-property probe verifies metadata, never capture',()=>{
  const result=interpretX100viVendorReadonlyResult(fixture,0);
  assert.equal(result.ptpSessionVerified,true);
  assert.equal(result.usbMode,6);
  assert.match(result.usbModeDescription,/RAW conversion/);
  assert.equal(result.tetherRawConditionCode.byteCount,25);
  assert.equal(result.tetherRawCompatibilityCode.byteCount,25);
  assert.equal(result.currentState,0);
  assert.equal(result.unknownD208.value,772);
  assert.equal(result.tetherModeSupported,'not-established');
  assert.equal(result.photographicCaptureVerified,false);
  assert.equal(result.shutterAvailable,false);
  assert.equal(result.shutterAttempted,false);
  assert.equal(result.photoSaved,'unverified');
});
test('partial, fake identity or failed probe never verifies Fujifilm protocol',()=>{
  assert.equal(interpretX100viVendorReadonlyResult(fixture.replace('0x0305','0x0400'),0).ptpSessionVerified,false);
  assert.equal(interpretX100viVendorReadonlyResult(fixture,2).ptpSessionVerified,false);
  assert.equal(interpretX100viVendorReadonlyResult(fixture.replace('PTP response=0x2001, data=25 bytes','PTP response=0x2002, data=0 bytes'),0).ptpSessionVerified,false);
  assert.equal(interpretX100viVendorReadonlyResult(fixture.replace('READ-ONLY QUERY: USBMode','OTHER: USBMode'),0).ptpSessionVerified,false);
  assert.doesNotMatch(JSON.stringify(interpretX100viVendorReadonlyResult(fixture+' Serial Number: PRIVATE',0)),/PRIVATE/);
});
