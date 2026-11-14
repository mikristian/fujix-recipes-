import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const script=await fs.readFile(new URL('../web/film-lab-shell/fujix-film-lab.js',import.meta.url),'utf8');
const RAF='DSCF5055.RAF';
const ID='0123456789abcdef01234567';
const PAYLOAD=new Uint8Array(1150);
PAYLOAD.set(new TextEncoder().encode('FUJIFILMCCD-RAW'),0);

class Element {
  constructor(id){
    this.id=id;this.disabled=false;this.hidden=id==='fxlab-library-panel';this.value='';this.textContent='';
    this.handlers=new Map();this.attributes=new Map();this.options=[];
    this.lastChild={textContent:' CAMERA DISCONNECTED'};
    this.cameraConnected=false;
    this.classList={contains:(name)=>name==='on'&&this.cameraConnected,toggle:()=>{}};
  }
  addEventListener(type,handler){this.handlers.set(type,[...(this.handlers.get(type)||[]),handler])}
  async fire(type){for(const handler of this.handlers.get(type)||[])await handler({type,target:this,defaultPrevented:false})}
  setAttribute(key,value){this.attributes.set(key,String(value))}
  replaceChildren(...children){this.options=children;this.value=''}
  add(option){this.options.push(option)}
  click(){return this.fire('click')}
}

function setup({changedSize=false}={}){
  const ids=['fxlab-camera-pill','fxlab-open-raf','btn-select-raf','status','fxlab-library-raf',
    'fxlab-library-panel','fxlab-library-files','fxlab-library-refresh','fxlab-library-develop',
    'fxlab-library-close','fxlab-library-status'];
  const elements=new Map(ids.map(id=>[id,new Element(id)]));
  const observers=[];
  const events=[];
  const requests=[];
  const windowListeners=new Map();
  const window={
    addEventListener(name,cb){windowListeners.set(name,cb)},
    dispatchEvent(event){events.push(event);windowListeners.get(event.type)?.(event)}
  };
  const records=[
    {id:ID,name:RAF,isOriginal:true,bytes:PAYLOAD.length},
    {id:'111111111111111111111111',name:'X100VI-USB-preview.RAF',isOriginal:false,bytes:PAYLOAD.length},
    {id:'222222222222222222222222',name:'not_a_raf.jpg',isOriginal:true,bytes:PAYLOAD.length},
    {id:'333333333333333333333333',name:'../attack.RAF',isOriginal:true,bytes:PAYLOAD.length},
  ];
  const document={
    getElementById(id){return elements.get(id)},
    addEventListener(){},
  };
  const fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url==='/api/usb/photos')return {ok:true,json:async()=>({files:records})};
    if(url==='/api/usb/photos/file/'+ID)return {ok:true,headers:{get:()=>String(changedSize?PAYLOAD.length+10:PAYLOAD.length)},arrayBuffer:async()=>PAYLOAD.slice().buffer};
    throw Error(`Unexpected URL ${url}`);
  };
  const sandbox={document,window,fetch,TextDecoder,Uint8Array,ArrayBuffer,
    Option:class {constructor(text,value){this.text=text;this.value=value}},
    CustomEvent:class {constructor(type,{detail}={}){this.type=type;this.detail=detail}},
    MutationObserver:class {constructor(fn){observers.push(fn)}observe(){}},
  };
  vm.runInNewContext(script,sandbox);
  const element=id=>elements.get(id);
  return {element,observers,events,requests,window};
}

test('archived-RAF selector hides previews and stays disabled without connected camera',async()=>{
  const app=setup();
  await app.element('fxlab-library-raf').click();
  await new Promise(resolve=>setImmediate(resolve));
  const select=app.element('fxlab-library-files');
  assert.equal(app.element('fxlab-library-panel').hidden,false);
  assert.equal(select.options.length,2,'one placeholder + one real original');
  assert.match(select.options[1].text,/DSCF5055.RAF/);
  assert.equal(select.options[1].value,ID);
  assert.equal(app.element('fxlab-library-develop').disabled,true);
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0].url,'/api/usb/photos');
});

test('connected camera uses local GET and forwards exact RAF bytes to compiled FilmKit adapter',async()=>{
  const app=setup();
  await app.element('fxlab-library-raf').click();
  await new Promise(resolve=>setImmediate(resolve));
  app.element('status').cameraConnected=true;
  app.observers.forEach(fn=>fn());
  app.element('fxlab-library-files').value=ID;
  await app.element('fxlab-library-files').fire('change');
  assert.equal(app.element('fxlab-library-develop').disabled,false);
  await app.element('fxlab-library-develop').click();
  const selected=app.events.find(event=>event.type==='fujix:archive-raf');
  assert.ok(selected,'must send a single explicit RAF load event');
  assert.equal(selected.detail.name,RAF);
  assert.equal(selected.detail.data.byteLength,PAYLOAD.length);
  assert.deepEqual(new Uint8Array(selected.detail.data),PAYLOAD);
  assert.ok(app.requests.every(r=>r.options.method===undefined),'archive must be read-only GET');
  app.window.dispatchEvent({type:'fujix:archive-raf-result',detail:{ok:true,message:'Camera-processed preview ready.',name:RAF}});
  assert.equal(app.element('fxlab-library-develop').disabled,false);
  assert.equal(app.element('fxlab-library-panel').hidden,true);
});

test('changes in file length abort before camera transfer',async()=>{
  const app=setup({changedSize:true});
  await app.element('fxlab-library-raf').click();
  await new Promise(resolve=>setImmediate(resolve));
  app.element('status').cameraConnected=true;
  app.observers.forEach(fn=>fn());
  app.element('fxlab-library-files').value=ID;
  await app.element('fxlab-library-files').fire('change');
  await app.element('fxlab-library-develop').click();
  assert.equal(app.events.filter(e=>e.type==='fujix:archive-raf').length,0);
  assert.match(app.element('fxlab-library-status').textContent,/length changed/);
});
