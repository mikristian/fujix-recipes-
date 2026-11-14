/**
 * Review capture-source validation. USB mode requires actual X100VI-labeled
 * frames; HDMI mode requires explicit selection of an external capture
 * device and is never described as a camera-identity-verification.
 */
const internal=/\b(?:facetime|built.in|continuity|iphone|ipad|macbook|mac camera|obs virtual|snap camera)\b/i;
export function captureInputIsAllowed({mode,label,chosenId,actualId,trackState,videoWidth,videoHeight,readyState}={}){
 if(!chosenId||!actualId||chosenId!==actualId||trackState!=='live'||
    videoWidth<128||videoHeight<128||readyState<2||!label||internal.test(label))return false;
 if(mode==='usb-x100vi')return /\bX100VI\b/i.test(label);
 if(mode==='external-hdmi')return true; // User-selected adapter; not camera ID proof.
 return false;
}
export function describeCaptureInput(mode,label){
 if(mode==='usb-x100vi')return 'Verified X100VI USB WEBCAM video track — video frames, not stills.';
 if(mode==='external-hdmi')return 'User-selected external capture device ('+String(label||'unknown').slice(0,90)+'). Source identity is not independently verified; video frames are not still photographs.';
 return 'No live capture source verified.';
}
