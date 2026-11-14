import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourcePath,validateMultishotManifest,groupMultishotManifest,createMultishotProject,createContactSheetHtml,createFfmpegRecipe} from '../multishot-studio.mjs';

const photo=(name,seconds,{type='film-simulation',eventId='ceremony',seriesId=null,sequenceIndex=null,expectedCount=null,metadata={}}={})=>({path:name,captureTime:new Date(Date.UTC(2026,10,2,12,0,seconds)).toISOString(),type,eventId,seriesId,sequenceIndex,expectedCount,metadata});
const manifest=(...sources)=>({version:1,sources});

test('explicit series IDs group film simulation with reliable numbered indices',()=>{
 const photos=[photo('DCIM/DSCF002.RAF',2,{seriesId:'sim-1',sequenceIndex:1,expectedCount:3}),photo('DCIM/DSCF001.RAF',1,{seriesId:'sim-1',sequenceIndex:0,expectedCount:3}),photo('DCIM/DSCF003.RAF',3,{seriesId:'sim-1',sequenceIndex:2,expectedCount:3})];
 const [group]=groupMultishotManifest(manifest(...photos));
 assert.equal(group.method,'declared seriesId');assert.equal(group.complete,true);
 assert.deepEqual(group.photos.map(p=>p.path),['DCIM/DSCF001.RAF','DCIM/DSCF002.RAF','DCIM/DSCF003.RAF']);
 assert.deepEqual(group.missingIndices,[]);
});

test('incomplete focus bracket reports missing index; no guessed images',()=>{
 const [group]=groupMultishotManifest(manifest(photo('focus/1.jpg',1,{type:'focus',seriesId:'f',sequenceIndex:0,expectedCount:3}),photo('focus/3.jpg',3,{type:'focus',seriesId:'f',sequenceIndex:2,expectedCount:3})));
 assert.equal(group.complete,false);assert.deepEqual(group.missingIndices,[1]);assert.match(group.warnings.join(' '),/Incomplete/);
});

test('capture proximity groups AE bracket and interval bursts independently',()=>{
 const sources=[photo('ae/1.jpg',1,{type:'ae',expectedCount:2}),photo('ae/2.jpg',2,{type:'ae',expectedCount:2}),photo('ae/3.jpg',25,{type:'ae'}),photo('interval/1.jpg',1,{type:'interval'}),photo('interval/2.jpg',30,{type:'interval'})];
 const groups=groupMultishotManifest(manifest(...sources));
 assert.equal(groups.length,3);assert.equal(groups.filter(g=>g.type==='ae').length,2);
 assert.equal(groups.find(g=>g.type==='interval').photos.length,2);
 assert.ok(groups.every(g=>g.method==='capture-time proximity'&&g.warnings.some(w=>/Heuristic/.test(w))));
});

test('different events and types never coalesce, even with overlapping timestamps and series IDs',()=>{
 const groups=groupMultishotManifest(manifest(photo('a/1.RAF',1,{seriesId:'x'}),photo('b/2.RAF',1,{seriesId:'x',eventId:'wedding'}),photo('c/3.RAF',1,{seriesId:'x',type:'focus'})));
 assert.equal(groups.length,3);
});

test('traversal, drive paths, absolute paths, and alternative separators are rejected',()=>{
 for(const unsafe of ['../DSCF.RAF','DCIM/../DSCF.RAF','/tmp/secret.jpg','C:/photos/file.jpg','DCIM\\DSCF.jpg','DCIM//DSCF.jpg','DCIM/./DSCF.jpg','DCIM/photo.jpg?x=1','DCIM/pic.jpg#hash','DCIM/a\u0000.jpg'])assert.throws(()=>validateSourcePath(unsafe));
 assert.equal(validateSourcePath('DCIM/SUB/DSCF0001.RAF'),'DCIM/SUB/DSCF0001.RAF');
 assert.throws(()=>validateSourcePath('README.sh'),/Unsupported/);
});

test('duplicate source, malformed dates, invalid expected count, and missing timezone are rejected',()=>{
 const p=photo('a.jpg',1);
 assert.throws(()=>validateMultishotManifest(manifest(p,p)),/Duplicate/);
 assert.throws(()=>validateMultishotManifest(manifest({...p,captureTime:'2026-11-02T12:00:00'})),/timezone/);
 assert.throws(()=>validateMultishotManifest(manifest({...p,sequenceIndex:3,expectedCount:3})),/exceeds/);
 assert.throws(()=>validateMultishotManifest(manifest({...p,eventId:''})),/eventId/);
});

test('project is a pure manifest snapshot with preserved sources',()=>{
 const input=manifest(photo('event/DSCF0001.RAF',1,{metadata:{simulation:'Acros'}}));
 const before=structuredClone(input);
 const project=createMultishotProject(input);
 assert.deepEqual(input,before);assert.equal(project.nonDestructive,true);assert.equal(project.generatedAt,null);
 assert.equal(project.groups[0].photos[0].path,input.sources[0].path);
 project.groups[0].photos[0].metadata.simulation='Changed';
 assert.deepEqual(input,before);
});

test('contact sheet escapes untrusted filenames and metadata, with scripts disallowed',()=>{
 const project=createMultishotProject(manifest(photo('folder/<img src=x onerror=alert(1)>.jpg',1,{eventId:'<script>alert(1)</script>'})));
 const html=createContactSheetHtml(project);
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.match(html,/default-src 'none'/);
});

test('ffmpeg recipe is inert argv, validates both path arguments, never runs anything',()=>{
 const recipe=createFfmpegRecipe({inputPattern:'frames/frame-%04d.jpg',outputFile:'exports/movie.mp4',frameRate:30});
 assert.equal(recipe.tool,'ffmpeg');assert.deepEqual(recipe.argv.slice(0,4),['-framerate','30','-i','frames/frame-%04d.jpg']);
 for(const inputPattern of ['../frames/%04d.jpg','/tmp/%04d.jpg','frames/$(touch hacked)%04d.jpg','frames/img.jpg'])assert.throws(()=>createFfmpegRecipe({inputPattern}));
 for(const outputFile of ['../../movie.mp4','/tmp/movie.mp4','-movie.mp4','movie.mov'])assert.throws(()=>createFfmpegRecipe({inputPattern:'frames/%04d.jpg',outputFile}));
});
