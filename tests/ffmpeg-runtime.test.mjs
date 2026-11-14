import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverLocalFfmpeg} from '../ffmpeg-runtime.mjs';

test('Intel and Apple Silicon renderer discovery checks only local executable files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fujix-runtime-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const binary=path.join(root,'ffmpeg');
 await fs.writeFile(binary,'mock binary',{mode:0o700});
 const canonical=await fs.realpath(binary);
 const intel=await discoverLocalFfmpeg({platform:'darwin',arch:'x64',candidates:[binary]});
 assert.equal(intel.available,true);
 assert.equal(intel.path,canonical);
 const appleSilicon=await discoverLocalFfmpeg({platform:'darwin',arch:'arm64',candidates:[binary]});
 assert.equal(appleSilicon.available,true);
 assert.equal(appleSilicon.path,canonical);
 const link=path.join(root,'brew-ffmpeg');
 await fs.symlink(binary,link);
 assert.equal((await discoverLocalFfmpeg({platform:'darwin',candidates:[link]})).path,canonical);
 const inaccessible=path.join(root,'not-executable');
 await fs.writeFile(inaccessible,'no executable bit',{mode:0o600});
 assert.equal((await discoverLocalFfmpeg({platform:'darwin',candidates:[inaccessible]})).available,false);
});

test('missing or invalid explicit renderer is transparent and never falls back silently',async()=>{
 const absent=await discoverLocalFfmpeg({platform:'darwin',explicit:'/an/absent/fujix-ffmpeg'});
 assert.equal(absent.available,false);
 assert.match(absent.reason,/FUJIX_FFMPEG_PATH/);
 const relative=await discoverLocalFfmpeg({platform:'darwin',explicit:'./ffmpeg'});
 assert.equal(relative.available,false);
 const otherOS=await discoverLocalFfmpeg({platform:'linux',candidates:['/usr/bin/ffmpeg']});
 assert.equal(otherOS.available,false);
});
