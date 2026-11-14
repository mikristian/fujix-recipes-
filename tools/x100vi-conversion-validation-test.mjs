import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { manifestFor } from './fujix-conversion-preflight.mjs';
import { sourceInfo, inspectJpeg, replayFixture } from './x100vi-conversion-validation-harness.mjs';

const raf='research/lightcraft-v0.18.1/x100vi-test/DSCF5055.RAF';
const jpeg=readFileSync('research/lightcraft-v0.18.1/x100vi-test/lightcraft-preview.jpg');
const source=await sourceInfo(raf);
assert.equal(source.sha256,'6ea69c7673b4f40f557563506bb63e2ece9b94f0886601081372b32cd2776e82');
const manifest=manifestFor(source);
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const profileHex='01'.repeat(605);
const events=[
  ['get-device-info',0x1001,{model:'X100VI',vendorId:0x04cb,productId:0x0305}],
  ['get-usb-mode',0x1015,{mode:6}],
  ['open-session',0x1002,{}],
  ['baseline-handles',0x1007,{handles:[10,11]}],
  ['send-object-info',0x900c,{objectFormat:0xf802,filename:'FUP_FILE.dat',size:source.size}],
  ['send-object-data',0x900d,{size:source.size,sha256:source.sha256}],
  ['read-profile',0x1015,{profileHex}],
  ['set-profile',0x1016,{profileSha256:sha(Buffer.from(profileHex,'hex'))}],
  ['start-conversion',0x1016,{payloadHex:'0000'}],
  ['poll-handles',0x1007,{handles:[10,11,12]}],
  ['get-object-info',0x1008,{handle:12,format:0x3801,size:jpeg.length}],
  ['download-jpeg',0x1009,{handle:12,sha256:sha(jpeg)}],
  ['close-session',0x1003,{}],
].map(([stage,opcode,data],i)=>({stage,opcode,response:0x2001,transactionId:i+1,...data}));
const run=(e=events,b=jpeg,after=source)=>replayFixture({manifest,events:e,jpegBytes:b,originalBefore:source,originalAfter:after});
const result=run();
assert.equal(result.ok,true);
assert.equal(result.camera_validated,false);
assert.equal(result.ownership.deletion_authorized,false);
assert.ok(result.jpeg.width>0 && result.jpeg.height>0);
const mutate=(fn)=>{const copy=structuredClone(events);fn(copy);assert.throws(()=>run(copy));};
mutate(e=>e[0].model='X100V');
mutate(e=>e[1].mode=1);
mutate(e=>e[4].objectFormat=0x5000);
mutate(e=>e[5].sha256='0'.repeat(64));
mutate(e=>e[6].profileHex='');
mutate(e=>e[7].profileSha256='0'.repeat(64));
mutate(e=>e[8].payloadHex='0001');
mutate(e=>e[9].handles=[10,11]);
mutate(e=>e[9].handles=[10,11,12,13]);
mutate(e=>e[10].handle=10);
mutate(e=>e[11].response=0x2002);
mutate(e=>e[12].transactionId=1);
assert.throws(()=>run(events,Buffer.from('not a jpeg')));
assert.throws(()=>run(events,jpeg,{...source,sha256:'f'.repeat(64)}));
assert.throws(()=>inspectJpeg(jpeg.subarray(0,jpeg.length-2)));
console.log(JSON.stringify({ok:true,offline:true,checks:16,stages:events.length,source,jpeg:result.jpeg,mutating_commands_sent:0}));
