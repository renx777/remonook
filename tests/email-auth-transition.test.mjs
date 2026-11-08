import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
await build({entryPoints:['src/CloudAccount.tsx'],bundle:true,packages:'external',outfile:'tests/.build/email-transition.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'account-fixture',setup(b){
 b.onResolve({filter:/^(firebase\/auth|\.\/(auth-service|data|Landing|AccountAccess|cloud-config))$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:{
  'firebase/auth':`export function onAuthStateChanged(auth,next){globalThis.__authNext=next;queueMicrotask(()=>next(auth.currentUser));return()=>{};}`,
  './auth-service':`export const auth=globalThis.__auth;export const authenticatedUid=()=>auth.currentUser?.uid;export const googleSignIn=async()=>{},googleSignOut=async()=>{},settleAuthOperation=async()=>{};`,
  './data':`export const setStorageAccount=id=>globalThis.__storageAccounts.push(id);export const setStorageName=name=>globalThis.__storageAccounts.push(name);`,
  './cloud-config':`export const CLOUD_API='https://sync.test';export const CLOUD_ENABLED=true;`,
  './Landing':`export const Landing=()=>null;`,
  './AccountAccess':`export const AccountAccess=()=>null,AccountSecurity=()=>null;`
 }[a.path]}));
}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'https://staging.remonook.com/#app'});
for(const k of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let reloads=0;globalThis.location={reload(){reloads++;}};globalThis.__auth={currentUser:{uid:'alice'}};globalThis.__storageAccounts=[];
const {createRoot}=await import('react-dom/client'),{AuthGate,setAccountTransitionHandler}=await import('./.build/email-transition.mjs');
test('same-account provider updates preserve the workspace, while account switches flush and reload once',async()=>{
 let flushes=0;setAccountTransitionHandler(async()=>{flushes++;});const root=createRoot(document.querySelector('#root'));
 try{
  await act(async()=>root.render(React.createElement(AuthGate,{children:user=>React.createElement('p',null,user?.uid)})));
  assert.deepEqual(globalThis.__storageAccounts,['alice']);assert.equal(document.querySelector('p').textContent,'alice');
  await act(async()=>globalThis.__authNext({uid:'alice',emailVerified:true,providerData:[{providerId:'password'}]}));assert.equal(reloads,0);assert.equal(flushes,0);
  globalThis.__auth.currentUser={uid:'bob'};
  await act(async()=>globalThis.__authNext({uid:'alice'}));assert.equal(reloads,0,'stale callback cannot switch the workspace');
  await act(async()=>globalThis.__authNext(globalThis.__auth.currentUser));assert.equal(reloads,1);assert.equal(flushes,1);assert.equal(window.location.hash,'#app');
  await act(async()=>globalThis.__authNext(globalThis.__auth.currentUser));assert.equal(reloads,1,'duplicate auth events cannot reload again');assert.deepEqual(globalThis.__storageAccounts,['alice'],'new account data is opened only after the reload');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
