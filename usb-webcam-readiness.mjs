/**
 * Read-only, source-honest Fujifilm X100VI USB webcam readiness.
 *
 * macOS enumeration identifies a possible camera video input. It does NOT
 * prove any live frames, photographic shutter, or full-resolution file
 * transfer. Browser-side FujiXUsbWebcam is responsible for proving that the
 * selected video track is live, labelled X100VI, and has decoded dimensions.
 */
export function assessUsbWebcamReadiness(status){
 const connected=status?.cameraPresent===true && status?.transport==='usb-webcam' &&
   status?.deviceLabel==='FUJIFILM X100VI';
 const available=status?.available!==false;
 return {
  model:'X100VI',
  connected,
  status:!available?'enumeration_unavailable':connected?'usb_camera_detected':'camera_not_detected',
  detectionOnly:true,
  transport:connected?'usb-webcam':null,
  browserFramesVerified:false,
  photographicShutterAvailable:false,
  originalJpegRafTransferAvailable:false,
  requiredConnectionMode:'USB WEBCAM',
  steps:connected?[
   'In FujiX Sync Library, select the Fujifilm X100VI USB camera as the video source.',
   'Grant browser camera permission if requested, then start live view.',
   'Verify actual moving video before saving a JPEG preview; this is not a photographic original.',
  ]:[
   'On the X100VI, choose Network/USB Setting → Connection Mode → USB WEBCAM.',
   'Connect USB-C directly to this Mac, power on the camera, and allow camera access in macOS.',
   'Refresh camera detection in FujiX Sync. Card Reader mode cannot stream webcam video.',
  ],
  note:'USB webcam video and USB card-reader originals require different camera modes. FujiX Sync does not claim simultaneous RAW tethered capture.',
 };
}
