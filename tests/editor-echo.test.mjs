import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {bullet} from '../src/domain.mjs';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Node','DOMParser','MutationObserver'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const {createRoot}=await import('react-dom/client');
const {BulletEditor}=await import('./.build/editor.mjs');

test('an older React echo cannot overwrite newer typing; authoritative external updates still apply',async()=>{
 const root=createRoot(document.querySelector('#root'));let latest=bullet('n',{text:'Start'}),editor;const initial=latest;
 const render=node=>root.render(createElement(BulletEditor,{node,caret:node.text.length,disabled:false,readCurrentNode:()=>latest,onChange:(id,value)=>{latest={...latest,...value};},onReady:e=>{editor=e;},onCommand(){},onOutlinePaste(){}}));
 try{
  await act(async()=>render(latest));
  let earlier;
  await act(async()=>{
   editor.commands.setTextSelection(editor.state.doc.content.size-1);
   editor.commands.insertContent(' one');earlier=latest;
   editor.commands.insertContent(' two 日本語');
  });
  // Undo/redo may arrive before the first passive text echo. Props can stay
  // identical while the authoritative model changes in both directions.
  const authored=latest;latest=initial;
  await act(async()=>render(initial));assert.equal(editor.getText(),'Start');
  latest=authored;await act(async()=>render(initial));assert.equal(editor.getText(),'Start one two 日本語');
  const position=editor.state.selection.from,documentBefore=editor.state.doc;
  await act(async()=>render(earlier));
  assert.equal(editor.getText(),'Start one two 日本語');
  assert.equal(editor.state.doc,documentBefore,'A stale echo must not replace the ProseMirror document or history');
  assert.equal(editor.state.selection.from,position);
  await act(async()=>render(latest));
  const edited=latest;latest={...latest,text:'Start',formatting:''};
  await act(async()=>render(latest));
  assert.equal(editor.getText(),'Start');
  latest=edited;await act(async()=>render(latest));
  assert.equal(editor.getText(),'Start one two 日本語');
  latest={...latest,text:'Received from another device',formatting:'0:8:BOLD'};
  await act(async()=>render(latest));
  assert.equal(editor.getText(),latest.text);
  assert.match(editor.getHTML(),/<strong>Received<\/strong>/);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
