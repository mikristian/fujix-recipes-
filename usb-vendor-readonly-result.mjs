/**
 * Parse only safe, bounded metadata from the fixed X100VI vendor read-only
 * helper. Never expose raw property payloads or camera serial identifiers.
 * Presence/metadata != photo capture or firmware tether mode support.
 */
const QUERIES=Object.freeze([
  {name:'USBMode',code:'0xD16E',key:'usbMode'},
  {name:'TetherRawConditionCode',code:'0xD186',key:'tetherRawConditionCode'},
  {name:'TetherRawCompatibilityCode',code:'0xD187',key:'tetherRawCompatibilityCode'},
  {name:'Fujifilm device property',code:'0xD208',key:'unknownD208'},
  {name:'CurrentState',code:'0xD212',key:'currentState'},
]);

export function interpretX100viVendorReadonlyResult(output,exitCode){
  const log=String(output||'').slice(0,32768);
  const identity=/ImageCaptureCore detected X100VI USB VID=0x04CB PID=0x0305/i.test(log);
  const deviceInfo=/PTP response code=0x2001\b/.test(log);
  const metadata={};
  let completed=0;
  for(const query of QUERIES){
    const start=log.indexOf('READ-ONLY QUERY: '+query.name+' ('+query.code);
    if(start<0)continue;
    const next=log.indexOf('READ-ONLY QUERY:',start+15);
    const section=log.slice(start,next<0?undefined:next);
    const response=/PTP response=0x([0-9a-f]{4}), data=(\d+) bytes/i.exec(section);
    if(!response)continue;
    const success=response[1].toLowerCase()==='2001';
    const bytes=Number(response[2]);
    if(!Number.isSafeInteger(bytes)||bytes<0||bytes>4096)continue;
    const entry={readSucceeded:success,byteCount:bytes};
    if(success&&bytes>=1&&bytes<=4){
      const value=/Read-only property value=0x([0-9a-f]+) \((\d+)\)/i.exec(section);
      if(value && Number(value[2])===Number.parseInt(value[1],16))entry.value=Number(value[2]);
    }
    metadata[query.key]=entry;
    if(success)completed++;
  }
  const verified=exitCode===0 && identity && deviceInfo && completed===QUERIES.length;
  const usbValue=metadata.usbMode?.value;
  return {
    stage:verified?'verified':'unavailable',
    ptpSessionVerified:verified,
    readOnlyPropertiesVerified:verified,
    usbMode:verified?usbValue??null:null,
    usbModeDescription:verified&&usbValue===6?'RAW conversion / backup restore':verified?'Unrecognized mode (not proof of tethering)':null,
    tetherRawConditionCode:metadata.tetherRawConditionCode??null,
    tetherRawCompatibilityCode:metadata.tetherRawCompatibilityCode??null,
    currentState:verified?metadata.currentState?.value??null:null,
    unknownD208:metadata.unknownD208??null,
    queriedProperties:completed,
    expectedProperties:QUERIES.length,
    tetherModeSupported:'not-established',
    photographicCaptureVerified:false,
    shutterAvailable:false,
    shutterAttempted:false,
    photoSaved:'unverified',
    cameraSettingsChanged:false,
    firmwareChanged:false,
    detail:verified?
      'X100VI responded to five read-only Fuji property requests. USB mode 6 is RAW conversion/backup; 25-byte TetherRaw metadata does not prove photographic USB tethering. No shutter or write operation was sent.':
      'The X100VI vendor property probe did not fully complete. Stop further camera commands until the PTP session is healthy.',
  };
}
