import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {act,createElement} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});for(const key of ['window','document','HTMLElement','Element','Node','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');const {EmojiProvider,useEmojiLibrary}=await import('./.build/AnimatedEmoji.mjs');
test('ordinary parent rerenders reuse the emoji catalogue while insertion calls the latest callback',async()=>{
 const root=createRoot(document.querySelector('#root')),emojis=[{token:':wave:',fileName:'wave.json',fallback:'👋'}],assets=new Map();let library,called='';
 function Consumer(){library=useEmojiLibrary();return null;}
 const render=(handler,files=assets)=>root.render(createElement(EmojiProvider,{emojis,assets:files,animate:true,onInsert:handler},createElement(Consumer)));
 try{
  await act(async()=>render(async()=>{called='first';}));const initial=library;
  await act(async()=>render(async()=>{called='latest';}));assert.equal(library,initial,'typing must not invalidate emoji decorations or rebuild its search catalogue');
  await library.onInsert(emojis[0],'note',0,0);assert.equal(called,'latest');
  await act(async()=>render(async()=>{},new Map()));assert.equal(library.emojis,initial.emojis);assert.equal(library.matcher,initial.matcher);assert.notEqual(library.assets,initial.assets,'real asset changes still refresh emoji artwork');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
