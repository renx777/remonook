import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import React,{act} from 'react';import {installOverlayGlobals} from './dom-overlays.mjs';import {empty} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';import {createProperty,setPropertyValues} from '../src/note-properties.mjs';
const dom=new JSDOM('<div class="app"><div id="root"></div></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','DOMParser','MutationObserver'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const {createRoot}=await import('react-dom/client');const {PropertiesDialog,TemplatesDialog}=await import('./.build/PkmDialogs.mjs');
const input=async(label,value)=>act(async()=>{const el=document.querySelector(`[aria-label="${label}"]`);assert.ok(el,label);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);const click=async b=>act(async()=>{assert.ok(b);b.click();});
test('property form preserves failed edits, saves only dirty fields, and disables saving a deleted target',async()=>{
 const base=empty();base.tables.bullets=[bullet('note',{text:'A useful note'})];const p=createProperty(base,{name:'Author',type:'text'}),q=createProperty(p.doc,{name:'Rating',type:'number'});let d=setPropertyValues(q.doc,'note',{[p.id]:'Original',[q.id]:0}),fail=true,values=null,closed=false;
 const root=createRoot(document.querySelector('#root'));const render=async()=>act(async()=>root.render(React.createElement(PropertiesDialog,{doc:d,id:'note',onClose:()=>closed=true,onSave:async v=>{if(fail)throw Error('Storage is full. Draft retained.');values=v;},onUpdate:async()=>{}})));
 try{await render();await input('Author','New author');await click(button('Save properties'));assert.match(document.querySelector('[role="alert"]').textContent,/Draft retained/);assert.equal(document.querySelector('[aria-label="Author"]').value,'New author');
  fail=false;await click(button('Save properties'));assert.deepEqual(values,{[p.id]:'New author'});assert.ok(closed);
  d={...d,tables:{...d.tables,bullets:[]}};await render();assert.ok(button('Save properties').disabled);assert.equal(document.querySelector('[aria-label="Author"]').value,'New author');
 }finally{await act(()=>root.unmount());}
});
test('note-link property keeps a selected note visible beyond the first hundred results',async()=>{
 const d=empty();d.tables.bullets=Array.from({length:150},(_,i)=>bullet('n'+i,{text:'Note '+i}));const p=createProperty(d,{name:'Project',type:'note'});const value=setPropertyValues(p.doc,'n0',{[p.id]:'n149'});const root=createRoot(document.querySelector('#root'));
 try{await act(async()=>root.render(React.createElement(PropertiesDialog,{doc:value,id:'n0',onSave:async()=>{},onClose:()=>{},onUpdate:async()=>{}})));assert.equal(document.querySelector('[aria-label="Project"]').value,'n149');}finally{await act(()=>root.unmount());}
});
test('template picker edits variables and prevents duplicate insertion while save is pending',async()=>{
 const d=empty(),root=createRoot(document.querySelector('#root'));let calls=0,resolve;const pending=new Promise(r=>resolve=r),used=[];
 try{await act(async()=>root.render(React.createElement(TemplatesDialog,{doc:d,parent:null,onClose:()=>{},onArchive:async()=>{},onUse:async(id,fields)=>{calls++;used.push([id,fields]);await pending;}})));
  await input('Template title','Design review');await act(async()=>{button('Use template').click();button('Use template').click();});assert.equal(calls,1);assert.equal(used[0][1].title,'Design review');await act(async()=>resolve());
 }finally{await act(()=>root.unmount());dom.window.close();}
});
