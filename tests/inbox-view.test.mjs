import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {empty,withNodes} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {INBOX_ID,processInbox} from '../src/inbox.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','HTMLInputElement','Node','DOMParser','MutationObserver'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.getComputedStyle=window.getComputedStyle.bind(window);
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const {createRoot}=await import('react-dom/client');
const {InboxView}=await import('./.build/InboxView.mjs');
const button=text=>[...document.querySelectorAll('button')].find(n=>n.textContent===text);
const click=async el=>{assert.ok(el);await act(async()=>el.click());};
test('a failed save keeps the capture and selected destination; stale sources close the form honestly; workspace remount clears selection',async()=>{
 const root=createRoot(document.querySelector('#root'));
 const doc=withNodes(empty(),[bullet(INBOX_ID,{text:'Inbox'}),bullet('capture',{parentId:INBOX_ID,text:'Keep this capture'}),bullet('project',{position:1,text:'Project'})]);
 let calls=0;
 const render=(value,scope='account-a',disabled=false)=>root.render(createElement(InboxView,{key:scope,doc:value,disabled,canUndo:false,canRedo:false,onChange(){calls++;throw Error('Saving needs attention.');},onOpen(){},onCapture(){},onTrash(){},onUndo(){}}));
 try{
  await act(async()=>render(doc));await click(button('File'));
  await click([...document.querySelectorAll('.inbox-destinations label')].find(n=>n.textContent.startsWith('Project')).querySelector('input'));
  await click(button('File note'));
  assert.equal(calls,1);assert.match(document.querySelector('[role="alert"]').textContent,/Saving needs attention/);
  assert.ok(document.querySelector('[data-inbox-id="capture"]'));assert.ok(document.querySelector('.inbox-destinations input:checked'));
  assert.equal(doc.tables.bullets.find(n=>n.id==='capture').parentId,INBOX_ID);
  await act(async()=>render(doc,'account-a',true));assert.equal(button('File note').disabled,true);
  await act(async()=>render(processInbox(doc,'capture',{kind:'file',target:'project'})));
  assert.equal(document.querySelector('.inbox-action-panel'),null);assert.match(document.querySelector('[role="alert"]').textContent,/moved or was removed/);
  await act(async()=>render(doc,'account-b'));assert.equal(document.querySelector('.inbox-action-panel'),null);assert.equal(document.querySelector('[role="alert"]'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
