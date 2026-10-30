import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
const dom=new JSDOM('<div class="app"><div id="root"></div><input id="outside"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','Element','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','NodeFilter','MutationObserver','CustomEvent','Event','DOMRect']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=undefined;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};
HTMLElement.prototype.scrollIntoView=function(){};
const {createRoot}=await import('react-dom/client');
const {OutlinePopover}=await import('./.build/OutlineChrome.mjs');
const {BulletMenuBody}=await import('./.build/BulletMenuBody.mjs');
const {ActionMenu,ActionMenuItem}=await import('./.build/ActionMenu.mjs');
const h=React.createElement;
const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
const click=async el=>{await act(async()=>el.click());await settle();};
const key=async value=>{await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await settle();};
function Fixture(){const[open,setOpen]=useState(false),[anchor,setAnchor]=useState(null),[menu,setMenu]=useState(false),[selected,setSelected]=useState('');return h(React.Fragment,null,
 h('button',{id:'bullet',onClick:e=>{setAnchor(e.currentTarget);setOpen(true);}},'Bullet actions'),
 open&&h(OutlinePopover,{anchor,title:'Bullet actions',onClose:()=>setOpen(false)},h(BulletMenuBody,null,h('div',{className:'popover-quick-actions'},h('button',null,'Complete')),h('details',null,h('summary',null,'Text'),h('button',null,'Paragraph')))),
 h(ActionMenu,{open:menu,onOpenChange:setMenu,trigger:h('button',{id:'commands'},'Commands')},h('div',{'aria-label':'Commands'},h(ActionMenuItem,{onClick:()=>setSelected('copy')},'Copy'),h(ActionMenuItem,{disabled:true},'Delete'),h(ActionMenuItem,{onClick:()=>setSelected('move')},'Move'))),h('output',null,selected));}
test('non-modal actions preserve nested Escape and outside focus; command menus navigate, skip disabled items and return focus',async()=>{
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(h(Fixture)));await click(document.getElementById('bullet'));
  assert.equal(document.activeElement.getAttribute('aria-label'),'Find a bullet action');
  await click(document.querySelector('[data-category="0"]'));await key('Escape');
  assert.ok(document.querySelector('.outline-popover[open]'),'First Escape only leaves the category');
  assert.equal(document.activeElement.dataset.category,'0');await key('Escape');
  assert.equal(document.querySelector('.outline-popover'),null);assert.equal(document.activeElement.id,'bullet');
  await click(document.getElementById('bullet'));
  await act(async()=>document.getElementById('outside').focus());await settle();
  assert.equal(document.querySelector('.outline-popover'),null);assert.equal(document.activeElement.id,'outside');
  await act(async()=>document.getElementById('commands').focus());await key('ArrowDown');
  assert.equal(document.activeElement.textContent,'Copy');await key('ArrowDown');assert.equal(document.activeElement.textContent,'Move');
  await key('Home');assert.equal(document.activeElement.textContent,'Copy');await key('m');assert.equal(document.activeElement.textContent,'Move');
  await key('Escape');assert.equal(document.querySelector('[role="menu"]'),null);assert.equal(document.activeElement.id,'commands');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
