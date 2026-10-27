import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {EmojiProvider,AnimatedEmoji} from './.build/AnimatedEmoji.mjs';
import {getFluentEmoji,fluentPosterPath,fluentAssetUrl} from '../src/fluent-emojis.mjs';
test('Fluent uses offline PNG posters for reduced motion, pauses offscreen and hidden, and previews download animations only on engagement',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://emoji.test'});
 for(const k of ['window','document','navigator','HTMLElement','Node'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const media={matches:true,addEventListener(_event,fn){this.listener=fn;},removeEventListener(){}};window.matchMedia=()=>media;
 let observer;globalThis.IntersectionObserver=class{constructor(fn){observer=fn;}observe(){observer([{isIntersecting:true}]);}disconnect(){}};
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,revoked=[];
 URL.createObjectURL=blob=>{assert.equal(blob.type,'image/png');return blob.size===9?'blob:animation':'blob:poster';};URL.revokeObjectURL=url=>revoked.push(url);
 const item=getFluentEmoji(':fluent_1f600:'),assets=new Map([['emoji/'+item.fileName,new Blob(['animation'])],[fluentPosterPath(item),new Blob(['poster'])]]),root=createRoot(document.querySelector('#root'));
 const render=(map,preview=false,playRequest=0,animate=true)=>act(async()=>root.render(React.createElement(EmojiProvider,{emojis:[item],assets:map,animate},React.createElement('button',{},React.createElement(AnimatedEmoji,{item,blob:map.get('emoji/'+item.fileName),preview,playRequest})))));
 try{
  await render(assets);assert.equal(document.querySelector('img').getAttribute('src'),'blob:poster');
  await act(async()=>{media.matches=false;media.listener();});assert.equal(document.querySelector('img').getAttribute('src'),'blob:animation');
  await act(async()=>observer([{isIntersecting:false}]));assert.equal(document.querySelector('img'),null);
  await act(async()=>observer([{isIntersecting:true}]));assert.equal(document.querySelector('img').getAttribute('src'),'blob:animation');
  await act(async()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(document.querySelector('img').getAttribute('src'),'blob:poster');
  await render(new Map());assert.equal(document.querySelector('img'),null,'Missing saved assets never fall back to remote images');
  await act(async()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));});
  await render(new Map(),true);assert.equal(document.querySelector('img').getAttribute('src'),fluentAssetUrl(item,true));
  await act(async()=>document.querySelector('button').dispatchEvent(new window.MouseEvent('mouseenter')));assert.equal(document.querySelector('img').getAttribute('src'),fluentAssetUrl(item));
  await act(async()=>document.querySelector('button').dispatchEvent(new window.MouseEvent('mouseleave')));assert.equal(document.querySelector('img').getAttribute('src'),fluentAssetUrl(item,true));
  await act(async()=>{media.matches=true;media.listener();});await render(new Map(),true,1);assert.equal(document.querySelector('img').getAttribute('src'),fluentAssetUrl(item),'Explicit Replay works with reduced motion');
  await render(assets,false,0,false);assert.equal(document.querySelector('img').getAttribute('src'),'blob:poster');
 }finally{await act(async()=>root.unmount());URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.close();}
 assert.ok(revoked.includes('blob:animation')&&revoked.includes('blob:poster'));
});
