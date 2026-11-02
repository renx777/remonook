import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import React,{act} from 'react';
const dom=new JSDOM('<script type="module" src="/assets/index-old.js"></script><div id="root"></div>',{url:'https://remonook.test',pretendToBeVisual:true});
for(const key of ['window','document','navigator','DOMParser','HTMLElement','location'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client'),{ReleaseUpdate}=await import('./.build/ReleaseUpdate.mjs');
const h=React.createElement,check=async()=>act(async()=>{window.dispatchEvent(new window.Event('focus'));await new Promise(r=>setTimeout(r,0));});
test('an old open tab detects a new entry, isolates status rendering and waits for saving; failed saves remain actionable',async()=>{
 const root=createRoot(document.getElementById('root')),original=globalThis.fetch;let next='old',renders=0,applies=0,rejectSave;
 globalThis.fetch=async(url,options)=>{assert.match(url,/index.html\?app-update=/);assert.equal(options.cache,'no-store');return{ok:true,text:async()=>`<script type="module" src="/assets/index-${next}.js"></script>`};};
 function Workspace(){renders++;return h(ReleaseUpdate,{enabled:true,onApply:()=>{applies++;return new Promise((_,reject)=>rejectSave=reject);}});}
 try{
  await act(async()=>root.render(h(Workspace)));await check();assert.equal(document.querySelector('aside'),null);
  next='new';await check();assert.match(document.querySelector('[role="status"]').textContent,/new version/);assert.equal(renders,1);assert.equal(applies,0,'detecting a release must not reload or save automatically');
  await act(async()=>document.querySelector('button').click());assert.equal(applies,1);assert.equal(document.querySelector('button').disabled,true);assert.equal(document.querySelector('button').textContent,'Saving…');
  await act(async()=>rejectSave(Error('Finish the open editor before updating.')));assert.match(document.querySelector('[role="alert"]').textContent,/Finish the open editor/);assert.equal(document.querySelector('button').disabled,false);assert.equal(renders,1);
  await act(async()=>document.querySelectorAll('button')[1].click());await check();assert.equal(document.querySelector('aside'),null,'Later dismisses this version');next='newer';await check();assert.ok(document.querySelector('aside'),'a subsequent release is still announced');
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;}
});
test('closing the workspace aborts an outstanding update check',async()=>{
 const root=createRoot(document.getElementById('root')),original=globalThis.fetch;let signal;
 globalThis.fetch=(_,options)=>{signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));};
 try{await act(async()=>root.render(h(ReleaseUpdate,{enabled:true,onApply:async()=>{}})));await check();assert.equal(signal.aborted,false);await act(async()=>root.unmount());assert.equal(signal.aborted,true);}finally{globalThis.fetch=original;}
});
test.after(()=>dom.window.close());
