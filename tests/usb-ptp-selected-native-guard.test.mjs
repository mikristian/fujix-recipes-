import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools','x100vi-card-reader-copy-selected.m');
const source=fs.readFileSync(file,'utf8');

test('native camera selection requires explicit filename, expected length and unique fresh camera match',()=>{
 assert.match(source,/strcmp\(argv\[1\],"--copy-selected"\)/);
 assert.match(source,/\[f\.name isEqualToString:self\.sourceName\]/);
 assert.match(source,/f\.fileSize!=self\.expectedBytes/);
 assert.match(source,/exactMatches!=1/);
 assert.match(source,/contentCatalogPercentCompleted>=100/);
 assert.match(source,/device\.usbVendorID!=0x04cb\|\|device\.usbProductID!=0x0305/);
 assert.match(source,/destinationAllowed\(argv\[4\]\)/);
});
test('native original transfer cannot overwrite, delete, reset, set settings, capture or touch other volumes',()=>{
 assert.match(source,/realpath\(p,resolved\)/);
 assert.match(source,/kAllowedRoot/);
 assert.match(source,/ICDeleteAfterSuccessfulDownload:@NO/);
 assert.match(source,/ICOverwrite:@NO/);
 assert.match(source,/ICDownloadSidecarFiles:@NO/);
 assert.match(source,/requestDownloadFile:selected/);
 for(const command of ['requestTakePicture','requestDeleteFiles:','requestSendPTPCommand:',
   'requestEject','requestUploadFile:','requestEnableTethering','requestSendMessage:']){
   assert.equal(source.includes(command),false,'Disallowed camera action '+command);
 }
});
