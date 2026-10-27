import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {fromEditor,toEditor} from './.build/editor.mjs';
import {bullet} from '../src/domain.mjs';
await build({entryPoints:['src/RoughAnnotation.tsx','src/RoughAnnotationPicker.tsx'],bundle:true,packages:'external',outdir:'tests/.build/rough',format:'esm',platform:'node',jsx:'automatic',outExtension:{'.js':'.mjs'},loader:{'.css':'empty'}});
const {RemoRough,mountRoughAnnotation}=await import('./.build/rough/RoughAnnotation.mjs');
const {RoughAnnotationPicker}=await import('./.build/rough/RoughAnnotationPicker.mjs');
const dom=new JSDOM('<div id="editor"></div><div id="tools"></div><div id="reader"><span id="content">Important idea</span></div>',{url:'https://rough.test',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle'])Object.defineProperty(globalThis,k,{value:k==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[k],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const media={matches:true,handlers:new Set(),addEventListener(_event,fn){this.handlers.add(fn);},removeEventListener(_event,fn){this.handlers.delete(fn);}};window.matchMedia=()=>media;
HTMLElement.prototype.getClientRects=function(){return [{x:10,y:10,left:10,top:10,width:(this.textContent?.length||1)*8,height:20,right:200,bottom:30}];};
HTMLElement.prototype.getBoundingClientRect=function(){return this.getClientRects()[0];};
dom.window.Range.prototype.getClientRects=()=>[];dom.window.Range.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:0,bottom:0,width:0,height:0});
const settle=()=>new Promise(r=>setTimeout(r,30));
test('selected-text picker creates real drawings while typing without inserting SVG into saved text, supports removing marks and cleans up',async()=>{
 const editor=new Editor({element:document.getElementById('editor'),extensions:[StarterKit,RemoRough],content:'<p>Remember this line</p>'}),root=createRoot(document.getElementById('tools'));
 try{
  editor.commands.setTextSelection({from:1,to:9});await act(async()=>root.render(React.createElement(RoughAnnotationPicker,{editor,disabled:false})));
  await act(async()=>document.querySelector('summary').click());await act(async()=>document.querySelector('[aria-label="Coral annotation"]').click());await act(async()=>document.querySelector('[aria-label="Sketch circle"]').click());await settle();
  const span=document.querySelector('#editor [data-remo-rough="circle"]');assert.ok(span);assert.ok(span.querySelector('svg path'));assert.equal(span.querySelector('svg').getAttribute('aria-hidden'),'true');
  let saved=fromEditor(editor.getJSON());assert.equal(saved.text,'Remember this line');assert.match(saved.formatting,/0:8:ROUGH_CIRCLE_F2A29B/);assert.ok(!editor.getHTML().includes('<svg'),'Clipboard serialization excludes generated drawing geometry');
  editor.commands.setTextSelection(5);editor.commands.insertContent('!');await settle();saved=fromEditor(editor.getJSON());assert.equal(saved.text,'Reme!mber this line');assert.match(saved.formatting,/ROUGH_CIRCLE_F2A29B/);
  editor.commands.setTextSelection({from:1,to:10});editor.commands.unsetMark('remoRough');await settle();assert.ok(!fromEditor(editor.getJSON()).formatting.includes('ROUGH_'));assert.equal(document.querySelectorAll('#editor svg.rough-annotation').length,0);
  const before=editor.getJSON();editor.commands.setTextSelection(1);await act(async()=>root.render(React.createElement(RoughAnnotationPicker,{editor,disabled:false})));assert.equal(document.querySelector('summary').getAttribute('aria-disabled'),'true');assert.deepEqual(editor.getJSON(),before);
  editor.commands.setContent(toEditor(bullet('overlap',{text:'Both edits',formatting:'0:10:ROUGH_CIRCLE_AUTO;0:10:ROUGH_UNDERLINE_A7C7E7'})));await settle();
  const overlapping=fromEditor(editor.getJSON());assert.ok(overlapping.formatting.includes('ROUGH_CIRCLE_AUTO'));assert.ok(overlapping.formatting.includes('ROUGH_UNDERLINE_A7C7E7'),'Loading overlapping concurrent marks must retain both');
 }finally{await act(async()=>root.unmount());editor.destroy();}
});
test('drawings redraw for changed text and resize, react to reduced motion and release observers on removal',async()=>{
 const host=document.getElementById('reader'),content=document.getElementById('content'),dispose=mountRoughAnnotation(host,content,{type:'box',color:'AUTO'});await settle();
 assert.ok(host.querySelector('svg path'));assert.equal(host.querySelector('path').style.animation,'');const initial=host.querySelector('path').getAttribute('d');
 content.textContent='A much longer important idea';await settle();assert.notEqual(host.querySelector('path').getAttribute('d'),initial);assert.equal(content.textContent,'A much longer important idea');
 media.matches=false;for(const fn of media.handlers)fn();window.dispatchEvent(new window.Event('resize'));await settle();assert.ok(host.querySelector('svg path'));
 dispose();assert.equal(host.querySelector('svg'),null);content.textContent='Cleaned up';window.dispatchEvent(new window.Event('resize'));await settle();assert.equal(host.querySelector('svg'),null);assert.equal(media.handlers.size,0);dom.window.close();
});
