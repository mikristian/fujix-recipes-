/**
 * Presence-only X100VI USB PTP discovery. No camera session, PTP commands,
 * USB interface claims, file reads/writes or shutter control.
 * Serial numbers are never included in returned data.
 */
export const X100VI_VENDOR_ID = 0x04cb;
export const X100VI_PTP_PRODUCT_ID = 0x0305;

function parseUsbNumber(value) {
  if(typeof value==='number' && Number.isInteger(value) && value>=0 && value<=0xffff)return value;
  if(typeof value!=='string')return null;
  const trimmed=value.trim();
  if(/^0x[0-9a-f]{1,4}$/i.test(trimmed))return Number.parseInt(trimmed,16);
  // SPUSBDataType may include a human-readable manufacturer after the
  // hexadecimal vendor ID: "0x04cb  (Fuji Photo Film Co., Ltd.)".
  // Match only a bounded hexadecimal token plus a parenthesized label.
  const hexWithLabel=/^0x([0-9a-f]{1,4})\s+\([^\r\n]{1,120}\)$/i.exec(trimmed);
  if(hexWithLabel)return Number.parseInt(hexWithLabel[1],16);
  const match=/^([0-9]{1,5})(?:\s+\(0x[0-9a-f]{1,4}\))?$/i.exec(trimmed);
  return match?Number.parseInt(match[1],10):null;
}

function devicesFromTree(tree) {
  const found=[];
  function visit(node){
    if(Array.isArray(node)){for(const entry of node)visit(entry);return;}
    if(!node||typeof node!=='object')return;
    if('USBDeviceKeyVendorID' in node || 'vendor_id' in node)found.push(node);
    for(const [key,value] of Object.entries(node)){
      if(key==='USBDeviceKeySerialNumber'||key==='serial_num')continue;
      if(value&&typeof value==='object')visit(value);
    }
  }
  visit(tree);
  return found;
}

export function inspectX100viUsbPtpInventory(inventory) {
  if(!inventory||typeof inventory!=='object')throw Error('Invalid macOS USB inventory');
  const match=devicesFromTree(inventory).find(device=>
    parseUsbNumber(device.USBDeviceKeyVendorID??device.vendor_id)===X100VI_VENDOR_ID &&
    parseUsbNumber(device.USBDeviceKeyProductID??device.product_id)===X100VI_PTP_PRODUCT_ID
  );
  const version=match?parseUsbNumber(match.USBDeviceKeyProductVersion??match.version_num):null;
  return {
    detected:Boolean(match),
    camera:'Fujifilm X100VI',
    // USB VID/PID alone cannot distinguish USB CARD READER, RAW CONV.,
    // or tether-related modes: D16E must be read separately via PTP.
    mode:match?'usb-ptp-mode-unverified':'not-detected',
    transport:match?'usb-ptp':null,
    vendorId:match?'0x04cb':null,
    productId:match?'0x0305':null,
    usbDeviceVersion:version===null?null:'0x'+version.toString(16).padStart(4,'0'),
    usbConnectionModeVerified:false,
    // USB identity does not establish an open PTP session, camera exposure,
    // saved original image, or the separate USB webcam video transport.
    ptpSessionVerified:false,
    usbPhotographicCaptureVerified:false,
    stillPhotoSaved:'unverified',
    webcamVideoDetected:false,
    shutterAvailable:false,
  };
}

/**
 * Some macOS versions enumerate a USB PTP device in IOKit while omitting it
 * from system_profiler's SPUSBHostDataType and SPUSBDataType inventories.
 * Parse only the property block of a real IOUSBHostDevice service. Matching
 * a user-visible label by itself is deliberately insufficient; use both
 * vendor and product IDs from that same device, and never return serials.
 *
 * Input: /usr/sbin/ioreg -p IOUSB -w0 -l (presence-only, no USB request).
 */
export function inspectX100viIoRegistry(output) {
  if(typeof output!=='string')throw Error('Invalid macOS USB IOKit inventory');
  let reading=false;
  let vendor=null,product=null,version=null;
  function finish() {
    const candidate={vendor,product,version};
    reading=false;vendor=null;product=null;version=null;
    return candidate.vendor===X100VI_VENDOR_ID&&candidate.product===X100VI_PTP_PRODUCT_ID
      ?candidate:null;
  }
  for(const line of output.split(/\r?\n/)){
    if(/^\s*[| ]*\+-o\s+.+<class (?:IOUSBHostDevice|AppleUSBDevice),/.test(line)){
      // Never combine IDs across adjacent USB devices.
      reading=true;vendor=null;product=null;version=null;
      continue;
    }
    if(!reading)continue;
    const value=/^\s*[| ]*"(idVendor|idProduct|bcdDevice)"\s*=\s*(0x[0-9a-f]+|[0-9]+)\s*$/i.exec(line);
    if(value){
      const number=/^0x/i.test(value[2])?Number.parseInt(value[2],16):Number.parseInt(value[2],10);
      if(value[1]==='idVendor')vendor=number;
      if(value[1]==='idProduct')product=number;
      if(value[1]==='bcdDevice')version=number;
    }
    if(/^\s*[| ]*}\s*$/.test(line)){
      const hit=finish();
      if(hit)return inspectX100viUsbPtpInventory({SPUSBHostDataType:[{
        USBDeviceKeyVendorID:hit.vendor,
        USBDeviceKeyProductID:hit.product,
        ...(hit.version===null?{}:{USBDeviceKeyProductVersion:hit.version}),
      }]});
    }
  }
  return inspectX100viUsbPtpInventory({SPUSBHostDataType:[]});
}
