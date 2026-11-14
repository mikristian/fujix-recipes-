#!/usr/bin/env node
// Purely offline fixture replay; no USB/camera imports, writes or network.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { manifestFor, validateManifest } from './fujix-conversion-preflight.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const expected = [
  ['get-device-info', 0x1001], ['get-usb-mode', 0x1015], ['open-session', 0x1002],
  ['baseline-handles', 0x1007], ['send-object-info', 0x900c], ['send-object-data', 0x900d],
  ['read-profile', 0x1015], ['set-profile', 0x1016], ['start-conversion', 0x1016],
  ['poll-handles', 0x1007], ['get-object-info', 0x1008], ['download-jpeg', 0x1009],
  ['close-session', 0x1003],
];

export function inspectJpeg(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 16 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length-2) !== 0xffd9) fail('jpeg_missing_soi_eoi');
  let pos = 2, width, height, sawSos = false;
  while (pos < bytes.length-2) {
    if (bytes[pos++] !== 0xff) fail('jpeg_invalid_marker');
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xda) { sawSos = true; break; }
    if (marker === 0xd9 || marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) fail('jpeg_invalid_segment');
    if (pos+2 > bytes.length-2) fail('jpeg_truncated_segment');
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos+length > bytes.length-2) fail('jpeg_invalid_segment_length');
    if ([0xc0,0xc1,0xc2,0xc3].includes(marker)) {
      if (length < 8) fail('jpeg_invalid_sof');
      height = bytes.readUInt16BE(pos+3); width = bytes.readUInt16BE(pos+5);
    }
    pos += length;
  }
  if (!sawSos || !width || !height || width > 65535 || height > 65535) fail('jpeg_missing_dimensions_or_scan');
  return { size: bytes.length, width, height, sha256: digest(bytes), structural_only: true };
}

export async function sourceInfo(path) {
  const before = statSync(path);
  if (!before.isFile() || before.size < 16 || before.size > 0xffffffff) fail('invalid_source_size');
  const fd = openSync(path,'r');
  const magic = Buffer.alloc(16);
  try { if (readSync(fd,magic,0,16,0)!==16 || !magic.toString('ascii').startsWith('FUJIFILMCCD-RAW')) fail('invalid_raf_magic'); }
  finally { closeSync(fd); }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const after = statSync(path);
  if (before.size!==after.size || before.mtimeMs!==after.mtimeMs || before.ino!==after.ino) fail('source_changed');
  return { name:path.split('/').at(-1), size:before.size, sha256:hash.digest('hex') };
}

export function replayFixture({ manifest, events, jpegBytes, originalBefore, originalAfter }) {
  validateManifest(manifest);
  if (!Array.isArray(events) || events.length !== expected.length) fail('wrong_event_count');
  const ownership = { session_open:false, profile_written:false, conversion_triggered:false, output_downloaded:false, deletion_authorized:false };
  let baseline, outputHandle, profileHash;
  for (let i=0;i<expected.length;i++) {
    const event=events[i], [name,op] = expected[i];
    if (!event || event.stage!==name || event.opcode!==op || event.response!==0x2001 || event.transactionId!==i+1) fail(`invalid_stage_${i+1}`);
    if (i===0 && (event.model!=='X100VI' || event.vendorId!==0x04cb || event.productId!==0x0305)) fail('wrong_device');
    if (i===1 && event.mode!==6) fail('wrong_usb_mode');
    if (i===2) ownership.session_open=true;
    if (i===3) { if (!Array.isArray(event.handles) || !event.handles.every(validHandle) || new Set(event.handles).size!==event.handles.length) fail('invalid_baseline'); baseline = new Set(event.handles); }
    if (i===4 && (event.objectFormat!==0xf802 || event.filename!=='FUP_FILE.dat' || event.size!==manifest.raf.size)) fail('invalid_object_info');
    if (i===5 && (event.size!==manifest.raf.size || event.sha256!==manifest.raf.sha256)) fail('invalid_uploaded_source');
    if (i===6) { if (typeof event.profileHex!=='string' || !/^(?:[\da-f]{2})+$/i.test(event.profileHex) || event.profileHex.length>8192) fail('invalid_profile'); profileHash=digest(Buffer.from(event.profileHex,'hex')); }
    if (i===7) { if (event.profileSha256!==profileHash) fail('changed_profile'); ownership.profile_written=true; }
    if (i===8) { if (event.payloadHex!=='0000' || !ownership.profile_written) fail('invalid_trigger'); ownership.conversion_triggered=true; }
    if (i===9) { if (!Array.isArray(event.handles) || !event.handles.every(validHandle) || new Set(event.handles).size!==event.handles.length) fail('invalid_poll'); const newHandles=event.handles.filter(h=>!baseline.has(h)); if (newHandles.length!==1) fail('ambiguous_output_handle'); outputHandle=newHandles[0]; }
    if (i===10 && (event.handle!==outputHandle || event.format!==0x3801 || event.size!==jpegBytes.length)) fail('invalid_result_provenance');
    if (i===11) { if (event.handle!==outputHandle || event.sha256!==digest(jpegBytes)) fail('invalid_download'); ownership.output_downloaded=true; }
    if (i===12) ownership.session_open=false;
  }
  if (!originalBefore || !originalAfter || originalBefore.sha256!==manifest.raf.sha256 || originalAfter.sha256!==manifest.raf.sha256 || originalBefore.size!==manifest.raf.size || originalAfter.size!==manifest.raf.size) fail('original_raf_changed');
  const jpeg=inspectJpeg(jpegBytes);
  // This never authorizes PTP DeleteObject: fixture handles cannot establish live provenance.
  return { ok:true, simulated:true, transmits:false, camera_validated:false, events_checked:events.length, original_sha256:manifest.raf.sha256, jpeg, ownership };
}
function validHandle(value) { return Number.isSafeInteger(value) && value>0 && value<=0xffffffff; }

async function cli(argv) {
  if (argv.length!==5 || argv[0]!=='--replay') fail('usage_--replay_manifest_json_events_json_jpeg_original_raf');
  const [,manifestPath,eventsPath,jpegPath,rafPath]=argv;
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const originalBefore=await sourceInfo(rafPath);
  const result=replayFixture({manifest,events:JSON.parse(readFileSync(eventsPath,'utf8')),jpegBytes:readFileSync(jpegPath),originalBefore,originalAfter:await sourceInfo(rafPath)});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({ok:false,error:e.code??'invalid_fixture',transmits:false}));process.exitCode=2;});
