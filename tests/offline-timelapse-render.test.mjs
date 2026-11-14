import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execPath} from 'node:process';
import {planOfflineTimelapse,renderOfflineTimelapse,MAX_TIMELAPSE_FRAMES} from '../offline-timelapse-render.mjs';

const JPEG=Buffer.from([255,216,255,224,0,7,74,70,73,70,0,255,192,0,17,8,0,10,0,20,3,1,17,0,2,17,0,3,17,0,255,218,0,2,0,1,2,255,217]);
const PNG=()=>{const b=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(16,16);b.writeUInt32BE(16,20);b[24]=8;b[25]=2;b.write('IEND',37);return b};
async function fixtures(t){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'fuji-timelapse-test-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 const sourceRoot=path.join(home,'photos'),outputRoot=path.join(home,'movies');
 await fs.mkdir(sourceRoot);await fs.mkdir(outputRoot);
 await fs.writeFile(path.join(sourceRoot,'one.jpg'),JPEG);await fs.writeFile(path.join(sourceRoot,'two.png'),PNG());
 const ffmpegPath=path.join(home,'fake-ffmpeg');
 const fake=`#!${execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);const output=args.at(-1);const mp4=Buffer.alloc(24);mp4.writeUInt32BE(24,0);mp4.write('ftyp',4);mp4.write('isom',8);fs.writeFileSync(output,mp4);\n`;
 await fs.writeFile(ffmpegPath,fake,{mode:0o700});
 const options={sourceRoot,outputRoot,filenames:['one.jpg','two.png'],ffmpegPath,outputName:'review.mp4'};
 return {home,sourceRoot,outputRoot,ffmpegPath,options};
}

test('dry-run validates images and returns clear plan without creating output',async t=>{
 const {options,outputRoot}=await fixtures(t);
 const planned=await planOfflineTimelapse(options);
 assert.equal(planned.frameCount,2);assert.equal(planned.frames[0].format,'jpeg');assert.equal(planned.frames[1].format,'png');
 assert.equal(planned.willExecute,false);assert.deepEqual(await fs.readdir(outputRoot),[]);
});

test('safe staged render writes only output, preserves both original frames byte for byte',async t=>{
 const {options,sourceRoot,outputRoot}=await fixtures(t);
 const original=await Promise.all(['one.jpg','two.png'].map(name=>fs.readFile(path.join(sourceRoot,name))));
 const before=original.map(data=>crypto.createHash('sha256').update(data).digest('hex'));
 const result=await renderOfflineTimelapse(options);
 assert.equal(result.rendered,true);assert.equal(result.frameCount,2);
 assert.deepEqual(await fs.readdir(outputRoot),['review.mp4']);
 const saved=await fs.readFile(result.outputPath);assert.equal(saved.toString('ascii',4,8),'ftyp');
 const after=await Promise.all(['one.jpg','two.png'].map(name=>fs.readFile(path.join(sourceRoot,name))));
 assert.deepEqual(after.map(data=>crypto.createHash('sha256').update(data).digest('hex')),before);
});

test('ExFAT fallback publishes a byte-identical MP4 without modifying the input photographs',async t=>{
 const {options,outputRoot,sourceRoot}=await fixtures(t);
 const first=await fs.readFile(path.join(sourceRoot,'one.jpg'));
 t.mock.method(fs,'link',async()=>{const e=Error('ExFAT does not support links');e.code='ENOTSUP';throw e});
 const result=await renderOfflineTimelapse(options);
 assert.equal(result.rendered,true);
 assert.deepEqual(await fs.readdir(outputRoot),['review.mp4']);
 assert.equal((await fs.readFile(result.outputPath)).toString('ascii',4,8),'ftyp');
 assert.deepEqual(await fs.readFile(path.join(sourceRoot,'one.jpg')),first);
});

test('ExFAT no-clobber fallback preserves a movie that appears during publication',async t=>{
 const {options,outputRoot}=await fixtures(t);
 const final=path.join(outputRoot,'review.mp4');
 t.mock.method(fs,'link',async()=>{const e=Error('Unsupported');e.code='ENOTSUP';throw e});
 t.mock.method(fs,'copyFile',async()=>{await fs.writeFile(final,'other-process');const e=Error('Destination already exists');e.code='EEXIST';throw e});
 await assert.rejects(renderOfflineTimelapse(options),/already exists/);
 assert.equal(await fs.readFile(final,'utf8'),'other-process');
 assert.deepEqual(await fs.readdir(outputRoot),['review.mp4']);
});

test('rejects input traversal, output traversal, duplicates and too few or too many frames',async t=>{
 const {options}=await fixtures(t);
 for(const bad of ['../one.jpg','/tmp/one.jpg','sub\\one.jpg','one.raf'])await assert.rejects(planOfflineTimelapse({...options,filenames:[bad,'two.png']}));
 for(const bad of ['../movie.mp4','/tmp/movie.mp4','dir/movie.mp4','movie.mov'])await assert.rejects(planOfflineTimelapse({...options,outputName:bad}));
 await assert.rejects(planOfflineTimelapse({...options,filenames:['one.jpg']}),/count/);
 await assert.rejects(planOfflineTimelapse({...options,filenames:['one.jpg','one.jpg']}),/Duplicate/);
 await assert.rejects(planOfflineTimelapse({...options,filenames:Array.from({length:MAX_TIMELAPSE_FRAMES+1},(_,i)=>`image-${i}.jpg`)}),/count/);
});

test('rejects file and directory symlinks and invalid image bodies',async t=>{
 const {options,sourceRoot,home}=await fixtures(t);
 await fs.symlink(path.join(sourceRoot,'one.jpg'),path.join(sourceRoot,'link.jpg'));
 await assert.rejects(planOfflineTimelapse({...options,filenames:['link.jpg','two.png']}),/symlink|Unsafe/i);
 await fs.symlink(sourceRoot,path.join(sourceRoot,'linked-dir'));
 await assert.rejects(planOfflineTimelapse({...options,filenames:['linked-dir/one.jpg','two.png']}),/symlink|Unsafe/i);
 await fs.writeFile(path.join(sourceRoot,'broken.jpg'),Buffer.alloc(100));
 await assert.rejects(planOfflineTimelapse({...options,filenames:['broken.jpg','two.png']}),/header/);
 const outside=path.join(home,'not-photos');await fs.symlink(sourceRoot,outside);
 await assert.rejects(planOfflineTimelapse({...options,sourceRoot:outside}),/Unsafe root/);
});

test('never overwrites existing movie and cleans stage after failed render',async t=>{
 const {options,outputRoot}=await fixtures(t);
 await fs.writeFile(path.join(outputRoot,'review.mp4'),'keep-existing');
 await assert.rejects(renderOfflineTimelapse(options),/already exists/);
 assert.equal(await fs.readFile(path.join(outputRoot,'review.mp4'),'utf8'),'keep-existing');
 await fs.rm(path.join(outputRoot,'review.mp4'));
 const failing=path.join(path.dirname(options.ffmpegPath),'fail-ffmpeg');
 await fs.writeFile(failing,`#!${execPath}\nprocess.exit(5)\n`,{mode:0o700});
 await assert.rejects(renderOfflineTimelapse({...options,ffmpegPath:failing}),/FFmpeg failed/);
 assert.deepEqual(await fs.readdir(outputRoot),[]);
});

test('absolute FFmpeg binary required and pre-aborted render never launches',async t=>{
 const {options,outputRoot}=await fixtures(t);
 await assert.rejects(renderOfflineTimelapse({...options,ffmpegPath:'ffmpeg'}),/absolute/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(renderOfflineTimelapse({...options,signal:controller.signal}),/canceled|aborted/i);
 assert.deepEqual(await fs.readdir(outputRoot),[]);
});

test('timeout kills hanging ffmpeg and clears temporary movie directory',async t=>{
 const {options,outputRoot}=await fixtures(t);
 const binary=path.join(path.dirname(options.ffmpegPath),'sleep-ffmpeg');
 await fs.writeFile(binary,`#!${execPath}\nsetTimeout(()=>{},15000)\n`,{mode:0o700});
 await assert.rejects(renderOfflineTimelapse({...options,ffmpegPath:binary,timeoutMs:1000}),/timed out/);
 assert.deepEqual(await fs.readdir(outputRoot),[]);
});
