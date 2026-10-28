import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {act,createElement} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});for(const key of ['window','document','HTMLElement','Element','Node','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');const {ResearchResults}=await import('./.build/ResearchResults.mjs');
const result=text=>({title:'Result',text,url:'https://example.com/topic',source:'example.com'});
test('destination changes discard stale searches; errors retry and selected text is usable',async()=>{
 const root=createRoot(document.querySelector('#root')),original=globalThis.fetch;let resolveOld,calls=0,chosen='';
 globalThis.fetch=async()=>{calls++;if(calls===1)return new Promise(resolve=>resolveOld=resolve);if(calls===2)return Response.json({error:'Search unavailable'},{status:502});return Response.json({results:[result('Classification and regression')],provider:'Bing'});};
 const render=id=>root.render(createElement(ResearchResults,{id,query:id,onUse:text=>chosen=text,disabled:false}));
 try{
  await act(async()=>render('old question'));assert.match(document.body.textContent,/Finding results/);
  await act(async()=>render('new question'));assert.match(document.body.textContent,/Search unavailable/);
  await act(async()=>{resolveOld(Response.json({results:[result('Stale result')]}));});assert.doesNotMatch(document.body.textContent,/Stale result/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry search').click());assert.match(document.body.textContent,/Classification and regression/);
  const text=document.querySelector('.research-result-text').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,14);
  await act(async()=>{window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.dispatchEvent(new window.Event('selectionchange'));});
  const use=[...document.querySelectorAll('button')].find(b=>b.textContent==='Use selected text');assert.ok(use);await act(async()=>use.click());assert.equal(chosen,'Classification');
 }finally{globalThis.fetch=original;await act(async()=>root.unmount());dom.window.close();}
});
