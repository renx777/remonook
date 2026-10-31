import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {installOverlayGlobals} from './dom-overlays.mjs';
const dom=new JSDOM('<div class="app"><div id="root"></div></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','Node','MutationObserver','DOMRect'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
installOverlayGlobals(dom);
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver=undefined;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
const viewport=new window.EventTarget();Object.assign(viewport,{height:844,offsetTop:0});
Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
HTMLElement.prototype.scrollIntoView=function(){};
const {createRoot}=await import('react-dom/client');
const {OutlinePopover}=await import('./.build/OutlineChrome.mjs');
const {BulletMenuBody}=await import('./.build/BulletMenuBody.mjs');
const h=React.createElement;
const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
const click=async el=>{await act(async()=>el.click());await settle();};
const key=async value=>{await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await settle();};
function Fixture(){const[anchor,setAnchor]=useState(null);return h(React.Fragment,null,h('button',{id:'bullet',onClick:e=>setAnchor(e.currentTarget)},'Actions'),anchor&&h(OutlinePopover,{anchor,title:'Bullet actions',className:'bullet-actions-menu',onClose:()=>setAnchor(null)},h(BulletMenuBody,null,h('div',{className:'popover-quick-actions'},h('button',null,'Complete')),h('details',null,h('summary',null,'Insert'),h('button',{'data-keywords':'whiteboard sketch'},'Draw with Excalidraw…')))));}
test('mobile actions avoid keyboard autofocus, follow keyboard viewport, preserve nested Escape and return focus',async()=>{
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(h(Fixture)));await click(document.getElementById('bullet'));
  const sheet=document.querySelector('.outline-mobile-sheet');assert.ok(sheet);assert.equal(document.activeElement,sheet);assert.equal(document.querySelector('.outline-sheet-backdrop')!==null,true);
  await click(document.querySelector('[data-category]'));assert.equal(document.activeElement.className,'bullet-category-back');await key('Escape');assert.ok(document.querySelector('.outline-mobile-sheet'));assert.equal(document.activeElement.dataset.category,'0');
  viewport.height=430;await act(async()=>viewport.dispatchEvent(new window.Event('resize')));assert.equal(sheet.style.maxHeight,'418px');
  const input=document.querySelector('.bullet-action-search input');await act(async()=>{input.focus();Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'whiteboard');input.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.match(document.querySelector('.bullet-search-results').textContent,/Excalidraw/);await key('Escape');assert.equal(document.querySelector('.bullet-search-results'),null);assert.ok(document.querySelector('.outline-mobile-sheet'));await key('Escape');assert.equal(document.querySelector('.outline-mobile-sheet'),null);assert.equal(document.activeElement.id,'bullet');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
