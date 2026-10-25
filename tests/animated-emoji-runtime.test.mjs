import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {builtinEmojis} from '../src/emoji-builtins.mjs';
await build({entryPoints:['src/AnimatedEmoji.tsx'],bundle:true,packages:'external',outfile:'tests/.build/animated-runtime.mjs',format:'esm',platform:'node',jsx:'automatic',plugins:[{name:'player-fixture',setup(b){b.onResolve({filter:/lottie-web\/build\/player\/lottie_light/},()=>({path:'player',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export default {loadAnimation({container}) { const p={isLoaded:true,loop:true,playing:false,destroyed:false,play(){this.playing=true;},pause(){this.playing=false;},goToAndStop(){this.playing=false;},goToAndPlay(){this.playing=true;},destroy(){this.destroyed=true;this.playing=false;},addEventListener(){}}; container.testPlayer=p;return p;}};`}));}}]});
const {AnimatedEmoji,EmojiProvider}=await import('./.build/animated-runtime.mjs');
const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,url:'https://emoji.test'});
for(const k of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const observers=[];
globalThis.IntersectionObserver=class{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){}};
const item=builtinEmojis[0];
test('cached synchronous Lottie replacements keep playing after cloud assets are refreshed',async()=>{
 const root=createRoot(document.getElementById('root'));
 const render=async(data,animate=true)=>act(async()=>{root.render(React.createElement(EmojiProvider,{emojis:[item],assets:new Map(),animate},React.createElement(AnimatedEmoji,{item,data})));});
 try{
  await render(structuredClone(item.data));await act(async()=>observers.at(-1).cb([{isIntersecting:true}]));
  const host=document.querySelector('.emoji-animation'),first=host.testPlayer;assert.equal(first.playing,true);
  await render(structuredClone(item.data));const second=host.testPlayer;assert.notEqual(first,second);assert.equal(first.destroyed,true);assert.equal(second.playing,true,'A fresh player must start even if ready remains true after React batches loading');
  await render(structuredClone(item.data),false);assert.equal(host.testPlayer.playing,false,'Explicit animation preference remains respected');
 }finally{await act(async()=>root.unmount());}
});

test('Noto animation retries a temporary failure instead of remaining a static poster',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const root=createRoot(document.getElementById('root')),noto={token:':noto_1f600:',fileName:'noto_1f600.webp',label:'Smile'};
 try{
  await act(async()=>root.render(React.createElement(AnimatedEmoji,{item:noto,localAssetBase:'/reminder-emojis'})));
  await act(async()=>observers.at(-1).cb([{isIntersecting:true}]));
  assert.match(document.querySelector('img').src,/webp$/);
  await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')));
  assert.match(document.querySelector('img').src,/svg$/);
  await act(async()=>t.mock.timers.tick(1100));
  assert.match(document.querySelector('img').src,/webp$/,'A temporary failure must recover without a page reload');
 }finally{await act(async()=>root.unmount());t.mock.timers.reset();}
});

test('emoji playback still works when visibility observers are unavailable',async()=>{
 const Observer=globalThis.IntersectionObserver;globalThis.IntersectionObserver=undefined;
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(AnimatedEmoji,{item,data:item.data})));
  assert.equal(document.querySelector('.emoji-animation').testPlayer?.playing,true);
 }finally{await act(async()=>root.unmount());globalThis.IntersectionObserver=Observer;}
});

test('WebP retries are bounded, recover on focus and asset refresh, and respect paused playback',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const root=createRoot(document.getElementById('root')),noto={token:':noto_1f600:',fileName:'noto_1f600.webp',label:'Smile'};
 const render=async(base,animate=true)=>act(async()=>root.render(React.createElement(EmojiProvider,{emojis:[noto],assets:new Map(),animate},React.createElement(AnimatedEmoji,{item:noto,localAssetBase:base}))));
 const fail=()=>act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')));
 try{
  await render('/first');await act(async()=>observers.at(-1).cb([{isIntersecting:true}]));
  for(const delay of [1100,2100,4100]){await fail();await act(async()=>t.mock.timers.tick(delay));assert.match(document.querySelector('img').src,/webp$/);}
  await fail();await act(async()=>t.mock.timers.tick(60000));assert.match(document.querySelector('img').src,/svg$/,'Do not retry a permanently broken asset forever');
  await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.match(document.querySelector('img').src,/webp$/);
  await fail();await render('/refreshed');assert.match(document.querySelector('img').src,/refreshed\/.*webp$/,'A new asset must not inherit the old failure');
  await render('/refreshed',false);assert.match(document.querySelector('img').src,/svg$/);
  await act(async()=>window.dispatchEvent(new window.Event('online')));await act(async()=>t.mock.timers.tick(60000));assert.match(document.querySelector('img').src,/svg$/,'Recovery must not override the animation preference');
 }finally{await act(async()=>root.unmount());t.mock.timers.reset();}
});
