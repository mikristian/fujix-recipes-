/**
 * Interpretation only of a ONE-TIME, exact-device, read-only PTP DeviceInfo
 * check. The native helper never writes to the camera or takes a photograph.
 */
export function interpretX100viPtpReadonlyProbe(output, exitCode) {
  const value=String(output||'');
  const identified=/ImageCaptureCore detected X100VI USB VID=0x04CB PID=0x0305/i.test(value);
  const ptpReply=/PTP response code=0x2001\b/i.test(value);
  const gotCapabilities=/Camera-advertised PTP operations \(\d+\):/i.test(value);
  const verified=exitCode===0 && identified && ptpReply && gotCapabilities;
  let reason;
  if(verified)reason='The real X100VI answered a read-only DeviceInfo request. No photographic capture command was sent.';
  else if(/Probe timeout|session timed out/i.test(value))reason='macOS can identify the USB device but the PTP camera session did not open. Safely power off and reconnect the camera before trying again.';
  else if(/open-session failed|PTP GetDeviceInfo error|No valid PTP/i.test(value))reason='The camera PTP DeviceInfo request did not succeed. No capture attempt was made.';
  else reason='The read-only PTP check did not produce a verifiable X100VI DeviceInfo response.';
  return {
    ptpSessionVerified:verified,
    standardCaptureAdvertised:verified ? /InitiateCapture\(0x100E\)=YES/.test(value) : null,
    capturePreviewAdvertised:verified ? /GetCapturePreview\(0x9022\)=YES/.test(value) : null,
    shutterAttempted:false,
    shutterAvailable:false,
    photoSaved:'unverified',
    firmwareChanged:false,
    cameraSettingsChanged:false,
    detail:reason,
  };
}
