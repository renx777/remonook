import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {bullet} from '../src/domain.mjs';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Node'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const {QuotesWidget}=await import('./.build/QuotesWidget.mjs');

test('quotes stay still across rerenders, shuffle, reflect edits and deletion, and link to the original note',async()=>{
 const root=createRoot(document.querySelector('#root')),originalRandom=Math.random;Math.random=()=>0;
 let nodes=[bullet('a',{text:'First thought. #quote\n— Someone'}),bullet('b',{text:'Second thought. #quote'})],opened;
 const render=(source='notes')=>root.render(createElement(QuotesWidget,{nodes,source,onNote:id=>{opened=id;}}));
 const text=()=>document.querySelector('blockquote')?.textContent;
 try{
  await act(async()=>render());assert.equal(text(),'First thought.');assert.equal(document.querySelector('.dash-quote-author').textContent,'Someone');
  await act(async()=>render());assert.equal(text(),'First thought.','Other dashboard updates must not change the quote');
  await act(async()=>document.querySelector('.dash-quote-origin').click());assert.equal(opened,'a');
  await act(async()=>document.querySelector('.dash-quote-next').click());assert.equal(text(),'Second thought.');
  nodes=nodes.map(n=>n.id==='b'?{...n,text:'Edited thought. #quote'}:n);
  await act(async()=>render());assert.equal(text(),'Edited thought.');
  nodes=nodes.filter(n=>n.id!=='b');await act(async()=>render());assert.equal(text(),'First thought.');assert.ok(document.querySelector('.dash-quote-next').disabled);
  nodes=[];await act(async()=>render());assert.equal(text(),undefined);assert.match(document.querySelector('.dash-quote-empty').textContent,/#quote/);
  await act(async()=>render('library'));assert.ok(text());const link=document.querySelector('.dash-quote-origin');assert.equal(link.tagName,'A');assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);
  nodes=[bullet('unsafe',{text:'<img src=x onerror=alert(1)> #quote'})];await act(async()=>render());assert.match(text(),/<img/);assert.equal(document.querySelector('.dash-quotes img'),null);
 }finally{Math.random=originalRandom;await act(async()=>root.unmount());dom.window.close();}
});
