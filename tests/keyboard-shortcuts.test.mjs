import test from 'node:test';import assert from 'node:assert/strict';import{JSDOM}from'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const k of['window','document','navigator','HTMLElement','HTMLInputElement','Node'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{KeyboardShortcuts}=await import('./.build/KeyboardShortcuts.mjs');
test('shortcut reference groups existing commands, searches descriptions and keys, and reports no matches',async()=>{const root=createRoot(document.getElementById('root'));try{
 await act(async()=>root.render(React.createElement(KeyboardShortcuts)));assert.equal(document.querySelectorAll('section').length,4);assert.ok(document.querySelector('.shortcuts-scroll dl'));const input=document.querySelector('input');
 const search=async text=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
 await search('sidebar');assert.equal(document.querySelectorAll('dt').length,1);assert.match(document.querySelector('dt').textContent,/Toggle sidebar/);
 await search('ctrl + k');assert.match(document.querySelector('dt').textContent,/Commands & notes/);await search('missing shortcut');assert.match(document.querySelector('[role="status"]').textContent,/No shortcuts/);
 await search('');assert.ok(document.querySelectorAll('dt').length>20);
 }finally{await act(async()=>root.unmount());dom.window.close();}});
