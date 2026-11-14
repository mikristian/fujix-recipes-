import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectX100viUsbPtpInventory,inspectX100viIoRegistry} from '../usb-ptp-presence.mjs';

const device={
  _name:'USB PTP Camera',USBDeviceKeyVendorID:'0x04cb',USBDeviceKeyProductID:'0x0305',
  USBDeviceKeyProductVersion:'0x0131',USBDeviceKeySerialNumber:'PRIVATE_CAMERA_SERIAL',
  _items:[],
};
test('macOS USBHost identifies the precise X100VI PTP vendor/product pair',()=>{
  const result=inspectX100viUsbPtpInventory({SPUSBHostDataType:[{_items:[{_name:'USB HUB',_items:[device]}]}]});
  assert.equal(result.detected,true);
  assert.equal(result.mode,'usb-ptp-mode-unverified');
  assert.equal(result.usbConnectionModeVerified,false);
  assert.equal(result.transport,'usb-ptp');
  assert.equal(result.usbDeviceVersion,'0x0131');
  assert.equal(result.ptpSessionVerified,false);
  assert.equal(result.usbPhotographicCaptureVerified,false);
  assert.equal(result.shutterAvailable,false);
  assert.equal(result.stillPhotoSaved,'unverified');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CAMERA_SERIAL/);
});
test('wrong camera IDs never masquerade as X100VI',()=>{
  assert.equal(inspectX100viUsbPtpInventory({SPUSBHostDataType:[{_items:[{...device,USBDeviceKeyProductID:'0x0306'}]}]}).detected,false);
  assert.equal(inspectX100viUsbPtpInventory({SPUSBHostDataType:[{_items:[{...device,USBDeviceKeyVendorID:'0x04b0'}]}]}).detected,false);
  assert.equal(inspectX100viUsbPtpInventory({SPUSBHostDataType:[{_items:[{_name:'X100VI Fake Camera',USBDeviceKeyVendorID:'0x04b0',USBDeviceKeyProductID:'0x0305'}]}]}).detected,false);
});
test('legacy USB inventory is supported without serial leakage',()=>{
  const result=inspectX100viUsbPtpInventory({SPUSBDataType:[{_items:[{vendor_id:'0x04cb',product_id:'0x0305',serial_num:'SENSITIVE'}]}]});
  assert.equal(result.detected,true);
  assert.doesNotMatch(JSON.stringify(result),/SENSITIVE/);
});
test('missing or invalid inventory is safely reported',()=>{
  assert.throws(()=>inspectX100viUsbPtpInventory(null));
  assert.equal(inspectX100viUsbPtpInventory({SPUSBHostDataType:[]}).detected,false);
  assert.equal(inspectX100viUsbPtpInventory({SPUSBHostDataType:[{USBDeviceKeyVendorID:'wrong',USBDeviceKeyProductID:'0x0305'}]}).detected,false);
});

const ioDevice=(name,vendor,product,version=305)=>[
  '  | +-o '+name+'@00100000  <class IOUSBHostDevice, id 0x123, registered, matched, active>',
  '  |     {',
  '  |       "USB Product Name" = "'+name+'"',
  '  |       "idProduct" = '+product,
  '  |       "idVendor" = '+vendor,
  '  |       "bcdDevice" = '+version,
  '  |       "USB Serial Number" = "PRIVATE_DO_NOT_EXPOSE"',
  '  |     }',
].join('\n');
test('IORegistry identifies Fujifilm 04cb:0305 even when system_profiler omitted it',()=>{
  const observed=ioDevice('USB PTP Camera',1227,773);
  const result=inspectX100viIoRegistry(observed);
  assert.equal(result.detected,true);
  assert.equal(result.vendorId,'0x04cb');
  assert.equal(result.productId,'0x0305');
  assert.equal(result.usbDeviceVersion,'0x0131');
  assert.equal(result.ptpSessionVerified,false);
  assert.equal(result.shutterAvailable,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DO_NOT_EXPOSE/);
});
test('IORegistry never combines a Fujifilm vendor from one device and an X100VI product from another',()=>{
  const adjacent=[ioDevice('USB PTP Camera',1227,999),ioDevice('Fake X100VI',1452,773)].join('\n');
  assert.equal(inspectX100viIoRegistry(adjacent).detected,false);
  assert.equal(inspectX100viIoRegistry(ioDevice('USB PTP Camera',1452,773)).detected,false);
  assert.equal(inspectX100viIoRegistry('Noise Fujifilm 0x04cb and 0x0305').detected,false);
  assert.throws(()=>inspectX100viIoRegistry(null));
});
test('IORegistry matched IDs can be hexadecimal and the USB product name is non-authoritative',()=>{
  const observed=ioDevice('Unknown peripheral','0x04cb','0x0305','0x0131');
  const result=inspectX100viIoRegistry(observed);
  assert.equal(result.detected,true);
  assert.equal(result.usbDeviceVersion,'0x0131');
});

test('real Intel macOS profiler identifies Fujifilm vendor with manufacturer label',()=>{
 const result=inspectX100viUsbPtpInventory({SPUSBDataType:[{_items:[
  {_name:'USB PTP Camera',vendor_id:'0x04cb  (Fuji Photo Film Co., Ltd.)',
   product_id:'0x0305',bcd_device:'1.31',serial_num:'SECRET'}]}]});
 assert.equal(result.detected,true);
 assert.equal(result.vendorId,'0x04cb');
 assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});
test('Intel AppleUSBDevice USB node is recognized without relying on device label',()=>{
 const value=ioDevice('USB PTP Camera',1227,773).replace('class IOUSBHostDevice','class AppleUSBDevice');
 assert.equal(inspectX100viIoRegistry(value).detected,true);
});
