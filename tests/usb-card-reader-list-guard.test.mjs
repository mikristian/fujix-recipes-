import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(ROOT,'tools','x100vi-card-reader-list.m'),'utf8');

test('Image Capture card catalog helper is hard-wired to the physical X100VI and read-only',()=>{
 assert.match(source,/device\.usbVendorID!=0x04cb\|\|device\.usbProductID!=0x0305/);
 assert.match(source,/strcmp\(argv\[1\],"--read-only"\)/);
 assert.match(source,/requestOpenSession/);
 assert.match(source,/requestCloseSession/);
 assert.match(source,/mediaFiles/);
 for(const action of ['requestDownloadFile:', 'requestReadDataFromFile:', 'requestDeleteFiles:', 'requestSendPTPCommand:',
  'requestTakePicture', 'requestEject', 'requestUploadFile:', 'requestEnableTethering', 'requestSendMessage:']) {
  assert.equal(source.includes(action),false,'Card catalog must never contain active camera operation '+action);
 }
});

test('Incomplete Image Capture catalog cannot silently return zero imported originals',()=>{
 assert.match(source,/contentCatalogPercentCompleted>=100/);
 assert.match(source,/deviceDidBecomeReadyWithCompleteContentCatalog/);
 assert.match(source,/CARD_STOP: Camera file catalog incomplete/);
 assert.match(source,/CARD_DOWNLOAD_ATTEMPTED: no/);
});
