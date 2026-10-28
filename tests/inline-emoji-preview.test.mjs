import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {readFile} from 'node:fs/promises';
import {getNotoEmoji} from '../src/noto-emojis.mjs';
await build({entryPoints:['src/InlineEmojiArtwork.tsx'],bundle:true,packages:'external',outfile:'tests/.build/inline-artwork.mjs',format:'esm',platform:'node',jsx:'automatic'});
const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','MutationObserver'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let reduced=false,mediaChanged;
window.matchMedia=()=>({get matches(){return reduced;},addEventListener(_name,handler){mediaChanged=handler;},removeEventListener(){}});
const {createRoot}=await import('react-dom/client');
const {EmojiThumbnail,InlineEmojiPreview}=await import('./.build/inline-artwork.mjs');
// The artwork bundle owns its context, whose defaults enable animation. A provider
// is not necessary for remote catalog previews; local asset reuse is app-tested.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('inline grid stays static; only the settled active preview loads, reuses bytes, and stops for reduced motion',async()=>{
 const root=createRoot(document.getElementById('root')),originalFetch=globalThis.fetch,requests=[];
 const rocket=getNotoEmoji(':noto_1f680:'),smile=getNotoEmoji(':noto_1f600:');
 globalThis.fetch=async(url,options)=>{requests.push({url:String(url),signal:options.signal});return new Response(await readFile(new URL('./fixtures/noto/1f680.'+(String(url).endsWith('webp')?'webp':'svg'),import.meta.url)));};
 const render=async item=>act(async()=>root.render(React.createElement(React.Fragment,null,...Array.from({length:8},(_,i)=>React.createElement(EmojiThumbnail,{key:'tile'+i,item:rocket})),item&&React.createElement(InlineEmojiPreview,{key:item.token,item}))));
 try{
  await render(null);await act(()=>pause(180));assert.equal(requests.length,0,'Posters do not fetch animation bytes');
  const tile=document.querySelector('.inline-emoji-thumbnail'),poster=tile.querySelector('img');
  assert.notEqual(tile.querySelector('.inline-emoji-fallback').style.visibility,'hidden','Unicode remains available while the poster loads');
  await act(async()=>poster.dispatchEvent(new window.Event('load')));
  assert.equal(tile.querySelector('.inline-emoji-fallback').style.visibility,'hidden','A loaded poster replaces the Unicode fallback');
  await act(async()=>poster.dispatchEvent(new window.Event('error')));
  assert.notEqual(tile.querySelector('.inline-emoji-fallback').style.visibility,'hidden','Failed posters restore one Unicode fallback');
  await render(smile);await act(()=>pause(30));await render(rocket);
  await act(()=>pause(250));assert.equal(requests.length,2,'Only one settled emoji downloads its animation and validated poster');
  assert.ok(document.querySelector('.inline-emoji-preview-animation'));
  const preview=document.querySelector('.inline-emoji-preview-art'),animated=preview.querySelector('.inline-emoji-preview-animation');
  assert.notEqual(preview.querySelector('.inline-emoji-thumbnail').style.visibility,'hidden','The poster stays available until animation loads');
  await act(async()=>animated.dispatchEvent(new window.Event('load')));
  assert.equal(preview.querySelector('.inline-emoji-thumbnail').style.visibility,'hidden','Animation replaces the entire static layer');
  assert.equal(animated.style.opacity,'1');
  assert.equal(document.querySelectorAll('.inline-emoji-thumbnail').length,9);
  await render(null);await render(rocket);await act(()=>pause(200));assert.equal(requests.length,2,'Reopening the same preview reuses cached bytes');
  await act(async()=>{reduced=true;mediaChanged();});assert.equal(document.querySelector('.inline-emoji-preview-animation'),null);
  await render(smile);await act(()=>pause(200));assert.equal(requests.length,2,'Reduced motion never downloads an animation');
  const inFlight=[];
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{inFlight.push(options.signal);options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});
  await act(async()=>{reduced=false;mediaChanged();});await act(()=>pause(200));
  assert.equal(inFlight.length,2);await render(null);
  assert.ok(inFlight.every(signal=>signal.aborted),'Closing the picker cancels in-flight preview resources');
 }finally{await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close();}
});
