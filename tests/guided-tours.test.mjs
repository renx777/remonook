import test from 'node:test';import assert from 'node:assert/strict';
import{guideCatalog,guideSteps,guideStorageKey,readGuideProgress,writeGuideProgress}from'../src/guided-tours.mjs';
test('walkthroughs adapt to guest bookshelf, PDF, EPUB and empty notes without mutating inputs',()=>{
 assert.equal(guideCatalog.length,3);const options={reader:true,pdf:false};const epub=guideSteps('reading',options);assert.deepEqual(options,{reader:true,pdf:false});assert.equal(epub.some(s=>/Search and contents|Capture an area/.test(s.target)),false);assert.equal(guideSteps('reading',{reader:true,pdf:true}).length,5);
 assert.match(guideSteps('reading',{signedIn:false})[1].description,/Sign in/);assert.match(guideSteps('reading',{signedIn:true})[1].description,/25 MiB/);
 for(const id of ['visual','study']){const steps=guideSteps(id,{hasNotes:false});assert.equal(steps.length,1);assert.equal(steps[0].prepare,'notes');}
 assert.equal(guideSteps('visual')[2].target,'[data-tour="create-diagram"]');assert.equal(guideSteps('study').at(-1).prepare,'study');assert.throws(()=>guideSteps('bad'),/unavailable/);
});
test('guide progress stays account-scoped, validates stored values, and tolerates storage failure',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 assert.equal(writeGuideProgress(storage,'guest',{reading:'done'}),true);assert.deepEqual(readGuideProgress(storage,'guest'),{reading:'done'});assert.deepEqual(readGuideProgress(storage,'user'),{});
 storage.setItem(guideStorageKey('user'),JSON.stringify({visual:'skipped',reading:'arbitrary',unknown:'done'}));assert.deepEqual(readGuideProgress(storage,'user'),{visual:'skipped'});storage.setItem(guideStorageKey('user'),'{broken');assert.deepEqual(readGuideProgress(storage,'user'),{});assert.deepEqual(readGuideProgress(null,'user'),{});assert.equal(writeGuideProgress(null,'user',{}),false);
});
