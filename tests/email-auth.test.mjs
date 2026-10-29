import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
await build({entryPoints:['src/AccountAccess.tsx'],bundle:true,packages:'external',outfile:'tests/.build/email-auth.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'}});
const dom=new JSDOM('<button id="entry">Sign in</button><div id="root"></div>',{url:'https://staging.remonook.com',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Node','Element'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client'),{AccountAccess,authError}=await import('./.build/email-auth.mjs');
const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
const input=async(label,value)=>act(async()=>{const field=[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent===label).querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new window.Event('input',{bubbles:true}));});
const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
const mount=async actions=>{const root=createRoot(document.querySelector('#root'));document.querySelector('#entry').focus();await act(async()=>root.render(React.createElement(AccountAccess,{onClose(){},actions})));return root;};
const base={google:async()=>{},login:async()=>{},signup:async()=>{},reset:async()=>{}};

test('email login, signup confirmation and reset use separate actions; passwords never leak into reset',async()=>{
 const calls=[];const root=await mount(Object.fromEntries(Object.keys(base).map(key=>[key,async(...args)=>{calls.push([key,...args]);}])));
 try{
  await input('Email','person@example.test');await input('Password','password123');await submit();assert.deepEqual(calls.shift(),['login','person@example.test','password123']);
  await click('Create an account');assert.equal(document.querySelector('[autocomplete="new-password"]').value,'');
  await input('Password','newPassword123');await input('Confirm password','different');await submit();assert.match(document.querySelector('[role="alert"]').textContent,/do not match/);assert.equal(calls.length,0);
  await input('Confirm password','newPassword123');await submit();assert.deepEqual(calls.shift(),['signup','person@example.test','newPassword123']);
  await click('Back to sign in');await click('Forgot password?');assert.equal(document.querySelector('[type=password]'),null);await submit();assert.deepEqual(calls.shift(),['reset','person@example.test']);assert.match(document.querySelector('[role="status"]').textContent,/If an account uses this email/);
  await click('Back to sign in');await click('Continue with Google');assert.deepEqual(calls.shift(),['google']);
 }finally{await act(async()=>root.unmount());}assert.equal(document.activeElement.id,'entry');
});
test('duplicate submissions are locked and network errors preserve the email for retry',async()=>{
 let reject,calls=0;const root=await mount({...base,login:()=>{calls++;return new Promise((_,no)=>reject=no);}});
 try{await input('Email','retry@example.test');await input('Password','secret123');await submit();await submit();assert.equal(calls,1);assert.equal(document.querySelector('fieldset').disabled,true);await act(async()=>reject({code:'auth/network-request-failed'}));assert.equal(document.querySelector('fieldset').disabled,false);assert.match(document.querySelector('[role="alert"]').textContent,/Check your connection/);assert.equal(document.querySelector('[type=email]').value,'retry@example.test');}finally{await act(async()=>root.unmount());}
});
test('unknown reset addresses have the same success response and invalid credentials stay generic',async()=>{
 const root=await mount({...base,reset:async()=>{throw {code:'auth/user-not-found'};}});
 try{await click('Forgot password?');await input('Email','unknown@example.test');await submit();assert.equal(document.querySelector('[role="alert"]'),null);assert.match(document.querySelector('[role="status"]').textContent,/If an account/);}finally{await act(async()=>root.unmount());}
 assert.equal(authError({code:'auth/user-not-found'}),authError({code:'auth/wrong-password'}));assert.match(authError({code:'auth/operation-not-allowed'}),/not enabled/);assert.match(authError({code:'auth/popup-blocked'}),/sign in with email/);
});
