import test from 'node:test';
import assert from 'node:assert/strict';
import {X100viPresetBridge} from '../web/filmkit-camera-bridge.mjs';

function prop(id,bytes,value){return {id,name:'test',bytes:new Uint8Array(bytes),value}}
class FakeCamera {
 connected=true;
 usbIdentity={vendorId:0x04cb,productId:0x0305};
 selected=3;
 writes=[];
 wrongReadback=false;
 info={model:'X100VI',manufacturer:'FUJIFILM',serialNumber:'fixture-no-real-hardware',deviceVersion:'1.31',properties:[0xD18C,0xD18D,0xD192],operations:[0x1015,0x1016]};
 slots=Array.from({length:7},(_,i)=>({name:'Fake C'+(i+1),data:new Map(Array.from({length:24},(_,j)=>[0xD18E+j,j===4?new Uint8Array([11,0]):new Uint8Array([1,0])]))}));
 async getDeviceInfo(){return this.info}
 async readProp(id){
  if(id===0xD18C)return prop(id,[this.selected,0],this.selected)
  const slot=this.slots[this.selected-1]
  if(id===0xD18D)return prop(id,[3,67,0,49,0,0,0],slot.name)
  const bytes=slot.data.get(id)
  if(!bytes)return null
  const value=this.wrongReadback&&id===0xD192?99:bytes[0]+bytes[1]*256
  return prop(id,this.wrongReadback&&id===0xD192?[99,0]:bytes,value)
 }
 async writePropU16(id,value){
  this.writes.push({id,value})
  if(id===0xD18C){this.selected=value;return true}
  if(id===0xD192){this.slots[this.selected-1].data.set(id,new Uint8Array([value&255,(value>>8)&255]));return true}
  return false
 }
 async writePropRaw(id,bytes){
  this.writes.push({id,bytes:Array.from(bytes)})
  if(id!==0xD192)return false
  this.slots[this.selected-1].data.set(id,new Uint8Array(bytes))
  this.wrongReadback=false
  return true
 }
}

function setup(){
 const fake=new FakeCamera(),bridge=new X100viPresetBridge();
 bridge.camera=fake;bridge.info=fake.info;
 return {fake,bridge};
}

async function mockedFetch(t){
 const old=globalThis.fetch;
 let saved=0;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/api/studio/camera-presets/backup')&&options?.method==='POST'){
   const body=JSON.parse(options.body);
   assert.equal(body.snapshot.slots.length,7);
   saved++;
   return new Response(JSON.stringify({ok:true,stored:true,slots:7,id:'20261104T170000Z-0000000001',sha256:'f'.repeat(64)}),{status:201});
  }
  if(String(url).includes('backup/verify?'))return new Response(JSON.stringify({ok:true,verified:true,sha256:'f'.repeat(64)}),{status:200});
  throw Error('Unexpected network request: '+url)
 };
 t.after(()=>{globalThis.fetch=old});
 return ()=>saved;
}

test('seven-slot camera backup reads all raw props, restores selected C slot, and unlocks write only after server verification',async(t)=>{
 const saved=await mockedFetch(t),{fake,bridge}=setup();
 const result=await bridge.scanAndBackup();
 assert.equal(saved(),1);
 assert.equal(result.snapshot.slots.length,7);
 assert.equal(result.snapshot.originalSlot,3);
 assert.equal(fake.selected,3);
 assert.equal(result.snapshot.slots[1].properties.length,24);
 assert.ok(fake.writes.length>=8);
 assert.equal(fake.writes.filter(w=>w.id===0xD192).length,0,'scan never writes film simulation property');
 assert.equal(bridge.backup?.stored,true);
});

test('one color simulation change modifies exactly one property and verifies every other slot',async(t)=>{
 await mockedFetch(t);
 const {fake,bridge}=setup();
 await bridge.scanAndBackup();
 const result=await bridge.testOneSimulation(2,1);
 assert.equal(result.ok,true);
 assert.equal(result.verified,true);
 assert.equal(result.slot,2);
 assert.equal(fake.selected,3);
 assert.deepEqual(Array.from(fake.slots[1].data.get(0xD192)),[1,0]);
 assert.deepEqual(Array.from(fake.slots[0].data.get(0xD192)),[11,0]);
 assert.equal(fake.writes.filter(w=>w.id===0xD192).length,1);
 assert.equal(bridge.backup,null,'a second write requires a fresh backup');
});

test('unverified changed readback triggers raw-byte rollback and locks further writes',async(t)=>{
 await mockedFetch(t);
 const {fake,bridge}=setup();
 await bridge.scanAndBackup();
 // Trigger a wrong film-property readback once the target property is written.
 const write=fake.writePropU16.bind(fake);
 fake.writePropU16=async(id,value)=>{
  const result=await write(id,value);
  if(id===0xD192)fake.wrongReadback=true;
  return result;
 };
 await assert.rejects(()=>bridge.testOneSimulation(2,1),/rollback: verified single-property restore/);
 assert.equal(fake.selected,3);
 assert.deepEqual(Array.from(fake.slots[1].data.get(0xD192)),[11,0]);
 assert.equal(bridge.backup,null);
});

test('incorrect USB product ID blocks all camera slot operations',async()=>{
 const {fake,bridge}=setup();fake.usbIdentity.productId=0x02e5;
 await assert.rejects(()=>bridge.scanAndBackup(),/Camera identity does not match X100VI/);
 assert.equal(fake.writes.length,0);
});
