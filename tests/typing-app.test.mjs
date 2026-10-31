import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import 'fake-indexeddb/auto';
import {empty,withNodes,save,load} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=undefined;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async check=>{for(let i=0;i<150;i++){if(await check())return;await act(async()=>new Promise(r=>setTimeout(r,20)));}throw Error('Timed out waiting for typing state');};
const key=value=>document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));

test('rapid editor transactions publish immediately to structural commands and durable saving',async()=>{
 const doc=withNodes(empty(),[bullet('q',{text:'Question?',kind:'QUESTION'}),bullet('answer',{parentId:'q',text:'Answer'})]);
 await save(null,doc);let app;
 try{
  await act(async()=>{app=await import('./.build/app.mjs');});
  await wait(()=>document.querySelector('[data-node-id="answer"] .text-button'));
  await act(async()=>document.querySelector('[data-node-id="answer"] .text-button').click());
  const editor=document.querySelector('.tiptap').editor;
  // One turn: the outline has not rendered the intermediate transactions when
  // Enter consumes the current document. A deferred mutation would lose text.
  await act(async()=>{
   editor.commands.setTextSelection(editor.state.doc.content.size-1);
   for(const text of [' one',' two',' 日本語'])editor.commands.insertContent(text);
   assert.equal(editor.getText(),'Answer one two 日本語');
   key('Enter');
  });
  await wait(()=>document.querySelectorAll('[data-depth="1"]').length===2);
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',code:'KeyS',ctrlKey:true,bubbles:true,cancelable:true})));
  await wait(async()=> (await load()).tables.bullets.length===3);
  const written=await load();
  assert.equal(written.tables.bullets.find(n=>n.id==='answer').text,'Answer one two 日本語');
  assert.match(written.tables.cards.find(c=>c.id==='q').answer,/Answer one two 日本語/);
  assert.equal(written.tables.bullets.filter(n=>n.parentId==='q').length,2);
  assert.equal(document.querySelector('.tiptap').textContent,'');
 }finally{await act(async()=>app?.appRoot.unmount());dom.window.close();}
});
