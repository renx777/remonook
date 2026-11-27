import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});for(const k of ['window','document','navigator','HTMLElement','localStorage'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {ReminderDelivery}=await import('./.build/ReminderDelivery.mjs');const {empty}=await import('./.build/data.mjs');
test('notification permission is explicit, denied access stays off and opting out clears device preference',async()=>{
 let requests=0;globalThis.Notification=class{static permission='denied';static async requestPermission(){requests++;return this.permission;}};
 const root=createRoot(document.getElementById('root'));try{await act(async()=>root.render(React.createElement(ReminderDelivery,{doc:empty(),controls:true})));assert.equal(requests,0);await act(async()=>document.querySelector('button').click());assert.equal(requests,1);assert.match(document.body.textContent,/blocked/);assert.ok(!Object.values(localStorage).includes('enabled'));
 Notification.permission='granted';await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('button').getAttribute('aria-label'),'Disable browser reminders');await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('button').getAttribute('aria-label'),'Enable browser reminders');assert.ok(!Object.values(localStorage).includes('enabled'));
 }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.Notification;}
});
