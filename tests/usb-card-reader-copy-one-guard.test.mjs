import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools','x100vi-card-reader-copy-one.m'),'utf8');

test('single JPEG transfer has explicit opt-in and fixed on-Mac destination boundary',()=>{
 assert.match(SOURCE,/strcmp\(argv\[1\],"--copy-one-jpeg"\)/);
 assert.match(SOURCE,/strcmp\(argv\[1\],"--copy-one-raf"\)/);
 assert.match(SOURCE,/--output-dir/);
 assert.match(SOURCE,/kAllowedRoot/);
 assert.match(SOURCE,/realpath\(p,resolved\)/);
 assert.match(SOURCE,/!S_ISLNK\(st.st_mode\)/);
 assert.match(SOURCE,/device\.usbVendorID!=0x04cb\|\|device\.usbProductID!=0x0305/);
 assert.match(SOURCE,/requestDownloadFile:selected/);
 assert.match(SOURCE,/ICOverwrite:@NO/);
 assert.match(SOURCE,/ICDeleteAfterSuccessfulDownload:@NO/);
 assert.match(SOURCE,/ICDownloadSidecarFiles:@NO/);
 assert.match(SOURCE,/self\.rawMode\?200ULL\*1024\*1024:64ULL\*1024\*1024/);
 assert.match(SOURCE,/COPY_SINGLE_%s_REQUESTED/);
});

test('card importer has no camera capture, delete, setting mutation or bulk download operations',()=>{
 for(const operation of ['requestDeleteFiles:','requestSendPTPCommand:','requestTakePicture','requestEject',
  'requestUploadFile:','requestSendMessage:','requestEnableTethering']) {
  assert.equal(SOURCE.includes(operation),false,operation+' must not be used');
 }
 assert.match(SOURCE,/COPY_EXPECTED_BYTES/);
 assert.match(SOURCE,/st\.st_size!=\(off_t\)self\.expectedBytes/);
 assert.match(SOURCE,/COPY_SUCCESS: yes/);
});
