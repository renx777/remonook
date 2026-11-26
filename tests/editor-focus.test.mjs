import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','Node','DOMParser','MutationObserver'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const frames=new Map();let nextFrame=0;
globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const {BulletEditor}=await import('./.build/editor.mjs');
test('a mounted or replaced editor owns focus and the requested selection before the next animation frame',async()=>{
 const root=createRoot(document.querySelector('#root'));let editor;
 const render=(node,extra={})=>root.render(createElement(BulletEditor,{node,caret:0,disabled:false,onChange(){},onReady:e=>{editor=e;},onCommand(){},onOutlinePaste(){},...extra}));
 try{
  await act(async()=>{
   flushSync(()=>render(bullet('first',{text:'First'}),{caret:3}));
   assert.ok(document.activeElement===editor.view.dom,'The first key must have a focused editor without waiting for rAF');
   assert.equal(editor.state.selection.from,4);
   flushSync(()=>render(bullet('second',{text:'Second'}),{initialSelection:{anchor:1,head:4}}));
   assert.ok(document.activeElement===editor.view.dom,'Enter/navigation must transfer focus before another key arrives');
   assert.equal(editor.state.selection.anchor,2);assert.equal(editor.state.selection.head,5);
   const button=document.createElement('button');document.body.append(button);button.focus();
   for(const fn of frames.values())fn(0);frames.clear();
   assert.ok(document.activeElement===button,'No queued editor focus may steal focus back from a later interaction');
   button.remove();
  });
 }finally{await act(async()=>root.unmount());}
});

test('a composing Android paragraph split survives a React echo until repair can create the next bullet',async()=>{
 const root=createRoot(document.querySelector('#root'));let composing=true,editor,latest=bullet('ime',{text:'日本語Answer',formatting:'0:3:BOLD'});const commands=[];
 const render=()=>root.render(createElement(BulletEditor,{node:latest,caret:3,disabled:false,readCurrentNode:()=>latest,onChange:(_id,value)=>{latest={...latest,...value};},onReady:e=>{editor=e;},onCommand:(...args)=>commands.push(args),onOutlinePaste(){}}));
 try{
  await act(async()=>render());
  await act(async()=>{
   Object.defineProperty(editor.view,'composing',{get:()=>composing,configurable:true});
   editor.commands.splitBlock();
   render();
  });
  await act(async()=>new Promise(resolve=>setTimeout(resolve,70)));
  assert.equal(commands.length,0,'Do not interrupt the composing keyboard');
  assert.equal(editor.state.doc.childCount,2,'The flattened echo must not erase the pending split');
  await act(async()=>{composing=false;});
  await act(async()=>new Promise(resolve=>setTimeout(resolve,70)));
  assert.equal(editor.state.doc.childCount,1);
  assert.equal(latest.text,'日本語Answer');
  assert.match(latest.formatting,/0:3:BOLD/);
  assert.deepEqual(commands,[['enter','ime',3,3]]);
 }finally{await act(async()=>root.unmount());}
});
test.after(()=>dom.window.close());
