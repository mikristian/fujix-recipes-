/**
 * Interpret ONLY the hardcoded, read-only X100VI USB storage/capture probe.
 * Never pass raw camera text, volume names, serial identifiers, firmware
 * contents, or objects through a localhost response.
 */
export function interpretX100viUsbTetherCapability(output,exitCode) {
  const log=String(output||'').slice(0,32768);
  const matched=/X100VI_USB_MATCH: vendor=0x04CB product=0x0305/.test(log);
  const mode=Number(/^USB_MODE_D16E: (\d+)$/m.exec(log)?.[1]);
  const count=Number(/^STORAGE_IDS_COUNT: (\d+)$/m.exec(log)?.[1]);
  const captures= /^CAPTURE_OPCODE_ADVERTISED: (yes|no)$/m.exec(log)?.[1];
  const openCaptures=/^OPEN_CAPTURE_OPCODE_ADVERTISED: (yes|no)$/m.exec(log)?.[1];
  const preview=/^FUJI_CAPTURE_PREVIEW_OPCODE_ADVERTISED: (yes|no)$/m.exec(log)?.[1];
  const records=[...log.matchAll(/^STORAGE_INFO: id=0x([0-9a-f]{8}) type=(\d+) filesystem=(\d+) access=(\d+) max=\d+ free=\d+ freeImages=\d+ category=(Still|Live|\[other storage\]|\[invalid\]|\[not-provided\]|\[redacted\])$/gmi)].slice(0,16);
  const storage=records.map(v=>({
    storageId:'0x'+v[1].toLowerCase(),type:Number(v[2]),
    filesystem:Number(v[3]),access:Number(v[4]),category:v[5],
  }));
  const replied=(log.match(/^PTP 0x[0-9A-F]{4} -> 0x2001 \(\d+ data bytes\)$/gm)||[]).length;
  const complete=exitCode===0 && matched && /^STORAGE_ENUM_COMPLETE: yes$/m.test(log) &&
    /^TETHER_CAPTURE_VERIFIED: no$/m.test(log) && Number.isInteger(mode) && mode>=0 &&
    Number.isInteger(count) && count>=0 && count<=16 && storage.length===count &&
    replied===count+3 && !!captures && !!openCaptures && !!preview;
  const allRam=complete && count>0 && storage.every(v=>v.type===3);
  return {
    stage:complete?'verified':'unavailable',
    ptpSessionVerified:complete,
    usbMode:complete?mode:null,
    usbModeDescription:complete&&mode===6?'RAW conversion / backup':null,
    standardCaptureAdvertised:complete?captures==='yes':null,
    openCaptureAdvertised:complete?openCaptures==='yes':null,
    capturePreviewAdvertised:complete?preview==='yes':null,
    storage:complete?storage:[],
    advertisedStorageCount:complete?count:null,
    onlyFixedRamStoragesAdvertised:complete?allRam:null,
    // Fixed-RAM-only is affirmative evidence that this PTP interface does
    // not *advertise* normal removable storage. Other media types would
    // still require independent SD-card identity verification.
    normalSdCardStorageObserved:complete&&allRam?false:null,
    usbTetherActive:complete?mode===5:false,
    // No software capability flags or metadata may imply actual shutter.
    usbPhotographicCaptureVerified:false,
    shutterAttempted:false,
    shutterAvailable:false,
    photoSaved:'unverified',
    cameraSettingsChanged:false,
    firmwareChanged:false,
    detail:complete
      ?'X100VI USB PTP storage and capture capability inspection completed without changes. This result identifies the active USB protocol only, not a successful still-photo capture.'
      :'X100VI USB PTP storage inspection did not finish; no photographic or write command was issued.',
  };
}
