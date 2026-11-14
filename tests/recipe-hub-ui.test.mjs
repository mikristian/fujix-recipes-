import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecipeHubRecord, safeRecipeHubUrl, recipeHubSourceLinks, shouldOpenRecipeHub} from '../web/recipe-hub.mjs';

const origin='http://localhost:3030';

test('staged and intake record fields render through the catalog display contract',()=>{
  const saved={
    id:'staged-123',
    title:'Vivid Summer',
    summary:'Warm bright film tones with lifted shadows.',
    imageUrl:'https://images.example.org/recipe.jpg',
    sourceUrl:'https://fujixweekly.com/recipe/',
    background:'Inspired by summer afternoons.',
    author:'Recipe Creator',
    sourceVerified:false,
    settings:{filmSimulation:'Classic Chrome'},
  };
  const result=normalizeRecipeHubRecord(saved,origin);
  assert.equal(result.name,saved.title);
  assert.equal(result.description,saved.summary);
  assert.equal(result.photo,saved.imageUrl);
  assert.equal(result.sourceUrl,saved.sourceUrl);
  assert.equal(result.background,saved.background);
  assert.equal(result.author,saved.author);
  assert.equal(result.sourceVerified,false);
  assert.deepEqual(result.settings,saved.settings);
  assert.equal(result.id,saved.id);
  assert.equal(result.title,saved.title);
  assert.equal(result.imageUrl,saved.imageUrl);
});

test('existing personal archive recipe shape keeps its local photo and data',()=>{
  const result=normalizeRecipeHubRecord({id:'backup-1-slot-2',name:'Cinestill 800T',description:'Cinema-inspired colors',photo:'/recipe-images/page-002-image-01.png',backupNumber:1},origin);
  assert.equal(result.name,'Cinestill 800T');
  assert.equal(result.description,'Cinema-inspired colors');
  assert.equal(result.photo,origin+'/recipe-images/page-002-image-01.png');
  assert.equal(result.backupNumber,1);
  assert.equal(result.sourceVerified,false);
});

test('remote images require HTTPS, unsafe URLs are rejected',()=>{
  assert.equal(safeRecipeHubUrl('https://images.example.com/a.png',{image:true,origin}),'https://images.example.com/a.png');
  assert.equal(safeRecipeHubUrl('http://remote.example.com/a.png',{image:true,origin}),'');
  assert.equal(safeRecipeHubUrl('javascript:alert(1)',{origin}),'');
  assert.equal(safeRecipeHubUrl('data:image/svg+xml,evil',{image:true,origin}),'');
  const result=normalizeRecipeHubRecord({id:'x',title:'Unsafe',imageUrl:'javascript:alert(1)',sourceUrl:'javascript:alert(2)',sourceVerified:false},origin);
  assert.equal(result.photo,'');
  assert.equal(result.sourceUrl,'');
  assert.equal(result.sourceVerified,false);
});

test('linked reference list deduplicates, bounds results, and marks only checked primary article',()=>{
  const primary='https://fujixweekly.com/film-recipe';
  const list=recipeHubSourceLinks({sourceUrl:primary,sourceVerified:true,sourceUrls:[
    'https://www.tiktok.com/example',primary,'javascript:alert(1)',...Array.from({length:12},(_,i)=>'https://example.org/'+i)
  ]},origin);
  assert.equal(list.length,8);
  assert.equal(list[0].url,primary);
  assert.equal(list[0].checked,true);
  assert.equal(list[1].url,'https://www.tiktok.com/example');
  assert.equal(list[1].checked,false);
  assert.equal(list.filter(x=>x.checked).length,1);
  assert.equal(recipeHubSourceLinks({sourceUrl:primary,sourceVerified:false},origin)[0].checked,false);
});

test('deep link opens hub only for recipeHub=1',()=>{
  assert.equal(shouldOpenRecipeHub('?recipeHub=1'),true);
  assert.equal(shouldOpenRecipeHub('?foo=bar&recipeHub=1'),true);
  assert.equal(shouldOpenRecipeHub(''),false);
  assert.equal(shouldOpenRecipeHub('?recipeHub=0'),false);
});
