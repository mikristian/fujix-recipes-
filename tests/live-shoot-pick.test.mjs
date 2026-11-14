import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedX100viStream,visibleReviewPhotos,reviewFileLabel} from '../web/live-shoot-pick.mjs';

function fakeVideo({label='FUJIFILM X100VI',readyState='live',videoWidth=1920,videoHeight=1080,mode='true',id='camera-usb',chosen='camera-usb',videoState=4}={}){
 const track={readyState,label,getSettings:()=>({deviceId:id})};
 const video={videoWidth,videoHeight,readyState:videoState,srcObject:{getVideoTracks:()=>[track]}};
 const doc={
  querySelector:()=>video,
  getElementById:key=>key==='fujix-live-mode-direct'?{getAttribute:()=>mode}:{value:chosen},
 };
 return {video,doc};
}
const id=n=>n.toString(16).padStart(24,'0');
const file=(n,isOriginal=false)=>({
 id:id(n),isOriginal,createdAt:n*1000,name:isOriginal?`DSCF${n}.RAF`:`X100VI-USB-${id(n)}.jpg`,
 fileUrl:'/api/usb/photos/file/'+id(n),bytes:n*10,
});

test('live monitor reuses a verified physical X100VI USB frame only',()=>{
 const {doc,video}=fakeVideo();
 assert.equal(verifiedX100viStream(doc),video);
 for(const options of [
  {label:'FaceTime HD Camera'},{label:'Example iPhone camera'},{label:'OBS Virtual Camera'},
  {readyState:'ended'},{videoWidth:0},{videoHeight:12},{mode:'false'},
  {id:'camera-usb',chosen:'wrong-camera'},{videoState:1},
 ]){
  assert.equal(verifiedX100viStream(fakeVideo(options).doc),null,JSON.stringify(options));
 }
 assert.equal(verifiedX100viStream(null),null);
});

test('photo selection distinguishes full-res originals from video-frame JPEGs',()=>{
 const files=[file(1,false),file(2,true),file(3,false)];
 assert.deepEqual(visibleReviewPhotos(files).map(f=>f.id),[id(3),id(2),id(1)]);
 assert.deepEqual(visibleReviewPhotos(files,'original').map(f=>f.id),[id(2)]);
 assert.deepEqual(visibleReviewPhotos(files,'preview').map(f=>f.id),[id(3),id(1)]);
 assert.deepEqual(visibleReviewPhotos(files,'picked',[id(1),id(2)]).map(f=>f.id),[id(2),id(1)]);
 assert.match(reviewFileLabel(files[0]),/NOT THE STILL/);
 assert.equal(reviewFileLabel(files[1]),'CAMERA ORIGINAL');
});

test('review thumbnail selection cannot point at arbitrary local URLs',()=>{
 const bad=[{...file(1),fileUrl:'file:///private/etc/passwd'}, {...file(2),id:'../etc/passwd'}, {...file(3),fileUrl:'/api/tether/files/abc'},file(4)];
 assert.deepEqual(visibleReviewPhotos(bad).map(f=>f.id),[id(4)]);
});
