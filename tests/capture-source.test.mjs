import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureInputIsAllowed,describeCaptureInput} from '../web/capture-source.mjs';

const valid={chosenId:'device-123',actualId:'device-123',trackState:'live',videoWidth:1920,videoHeight:1080,readyState:4};
test('native Fujifilm USB webcam requires matching selected device, a live frame and X100VI label',()=>{
 assert.equal(captureInputIsAllowed({...valid,mode:'usb-x100vi',label:'FUJIFILM X100VI'}),true);
 for(const wrong of [{label:'USB Capture'}, {actualId:'different'}, {videoWidth:0},
   {trackState:'ended'}, {readyState:1},{chosenId:''},{label:'iPhone'}]){
   assert.equal(captureInputIsAllowed({...valid,mode:'usb-x100vi',label:'X100VI',...wrong}),false);
 }
});
test('external HDMI monitor accepts an explicitly chosen capture input but refuses built-in and virtual sources',()=>{
 assert.equal(captureInputIsAllowed({...valid,mode:'external-hdmi',label:'Elgato Cam Link 4K'}),true);
 assert.equal(captureInputIsAllowed({...valid,mode:'external-hdmi',label:'USB Video'}),true);
 for(const label of ['FaceTime HD Camera','MacBook Pro Camera','iPhone Continuity Camera',
   'OBS Virtual Camera','Built-in Webcam']){
   assert.equal(captureInputIsAllowed({...valid,mode:'external-hdmi',label}),false,label);
 }
 assert.equal(captureInputIsAllowed({...valid,mode:'external-hdmi',label:'USB Capture',actualId:'wrong'}),false);
 assert.match(describeCaptureInput('external-hdmi','Cam Link'),/not independently verified/);
 assert.match(describeCaptureInput('usb-x100vi','X100VI'),/video frames, not stills/);
});
test('Live Shoot & Pick offers real camera/video input selection and watched-original delivery without conflating them',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const ui=fs.readFileSync(path.join(root,'web','live-shoot-pick.mjs'),'utf8');
 assert.match(ui,/fxlp-input-mode/);
 assert.match(ui,/fxlp-detect-inputs/);
 assert.match(ui,/mediaDevices\.getUserMedia/);
 assert.match(ui,/fxlp-watch-start/);
 assert.match(ui,/\/api\/usb\/originals\/watch\/start/);
 assert.match(ui,/fxlp-source-folder/);
 assert.match(ui,/\/api\/tether\/folder/);
 assert.match(ui,/Video frames are never labeled as full-resolution photographs/);
 assert.match(ui,/USB and HDMI cables cannot be used together/);
 assert.match(ui,/Frame\.io Drive setup/);
 assert.doesNotMatch(ui,/camera saved a 40MP original automatically/);
});
