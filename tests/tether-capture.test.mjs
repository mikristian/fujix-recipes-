import test from 'node:test';
import assert from 'node:assert/strict';
import {ShotReviewMatcher,verifiedX100viVideo} from '../web/tether-capture.mjs';

test('one click pending shot requires a new real file, not an existing photo',()=>{
 const m=new ShotReviewMatcher();
 m.prime([{id:'old',name:'OLD.JPG'}]);
 const shot=m.arm(100);
 assert.equal(m.consume([{id:'old'}]).length,0);
 assert.equal(m.pending.length,1);
 const matches=m.consume([{id:'new',name:'DSCF1234.JPG'},{id:'old'}]);
 assert.equal(matches.length,1);
 assert.equal(matches[0].shot.id,shot.id);
 assert.equal(matches[0].photo.name,'DSCF1234.JPG');
 assert.equal(m.consume([{id:'new',name:'DSCF1234.JPG'}]).length,0);
});

test('failed shots are canceled; pending shots expire without claiming a camera photo',()=>{
 const m=new ShotReviewMatcher();
 const canceled=m.arm(100);m.cancel(canceled.id);
 assert.equal(m.consume([{id:'now'}]).length,0);
 m.arm(200);m.arm(300);
 assert.equal(m.expire(201),1);
 assert.equal(m.pending.length,1);
});

function doc({label='FUJIFILM X100VI',trackState='live',dimensions=true,mode='true',selectedLabel='FUJIFILM X100VI',deviceId='camera-1'}={}){
 const video={videoWidth:dimensions?1920:0,videoHeight:dimensions?1080:0,srcObject:{getVideoTracks:()=>[{label,readyState:trackState,getSettings:()=>({deviceId})}]}};
 const selected={value:'camera-1',selectedOptions:[{textContent:selectedLabel}]};
 const direct={getAttribute:()=>mode};
 return {querySelector:selector=>selector.startsWith('video')?video:selector==='#fujix-video-source'?selected:selector==='#fujix-live-mode-direct'?direct:null};
}
test('Mac preview requires verified active X100VI video, never silently uses webcam',()=>{
 assert.equal(verifiedX100viVideo(doc()).videoWidth,1920);
 assert.equal(verifiedX100viVideo(doc({label:'FaceTime HD Camera'})),null);
 assert.equal(verifiedX100viVideo(doc({label:'iPhone Camera'})),null);
 assert.equal(verifiedX100viVideo(doc({dimensions:false})),null);
 assert.equal(verifiedX100viVideo(doc({trackState:'ended'})),null);
 assert.equal(verifiedX100viVideo(doc({mode:'false'})),null);
 assert.equal(verifiedX100viVideo(doc({selectedLabel:'MacBook camera'})),null);
 assert.equal(verifiedX100viVideo(doc({deviceId:'another-source'})),null);
});
