import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {MacAwake} from '../mac-awake.mjs';

test('Mac awake starts only when invoked, refreshes heartbeat and releases after timeout',()=>{
  let now=1000,starts=0,kills=0;
  const fakeSpawn=(name,args)=>{
    assert.equal(name,'/usr/bin/caffeinate');assert.deepEqual(args,['-dimsu']);starts++;
    const p=new EventEmitter();p.kill=()=>{kills++};return p;
  };
  const lock=new MacAwake({spawnFn:fakeSpawn,now:()=>now,ttlMs:1000});
  assert.equal(starts,0);assert.equal(lock.status().active,false);
  assert.equal(lock.start().active,true);assert.equal(starts,1);
  now+=700;lock.heartbeat();assert.equal(starts,1);
  now+=800;assert.equal(lock.expire().active,true);
  now+=300;assert.equal(lock.expire().active,false);assert.equal(kills,1);
  assert.equal(lock.stop().active,false);assert.equal(kills,1);
});
test('repeat Mac wake requests reuse the existing child, stop is idempotent',()=>{
  let starts=0,kills=0;
  const lock=new MacAwake({spawnFn:()=>{starts++;const p=new EventEmitter();p.kill=()=>{kills++};return p;}});
  lock.start();lock.start();assert.equal(starts,1);
  lock.stop();lock.stop();assert.equal(kills,1);
});
