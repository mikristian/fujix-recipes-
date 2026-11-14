// FAKE camera fixture, never shipped or referenced by production launch path.
import {readFileSync} from 'node:fs';
const frame=readFileSync(new URL('./synthetic-test-frame.jpg',import.meta.url));
console.error('PTP_X100VI_VERIFIED');
console.error('PTP_LIVEVIEW_READY');
const payload=Buffer.allocUnsafe(4+frame.length);
payload.writeUInt32BE(frame.length,0);frame.copy(payload,4);
const timer=setInterval(()=>process.stdout.write(payload),85);
// A synthetic test-only acknowledgment, NOT proof an X100VI takes a photograph.
process.stdin.setEncoding('utf8');
process.stdin.on('data',data=>{
  if(data==='SHOOT\n')console.error('PTP_SHUTTER_REQUEST_ACCEPTED: synthetic fixture only; no photograph saved');
});
process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0)});
