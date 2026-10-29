import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
await build({stdin:{contents:"export {GoogleTasksProvider,GoogleTasksConnection,useGoogleTasks} from './src/GoogleTasks'; export {GoogleTasksWidget,orderedGoogleTasks} from './src/GoogleTasksWidget';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,packages:'external',outfile:'tests/.build/google-tasks-ui.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'config',setup(b){b.onResolve({filter:/^\.\/cloud-config$/},()=>({path:'config',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const CLOUD_API='https://tasks.test';"}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'https://staging.remonook.com',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Node','Element'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client'),{GoogleTasksProvider,GoogleTasksConnection,GoogleTasksWidget,orderedGoogleTasks}=await import('./.build/google-tasks-ui.mjs');
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await act(async()=>new Promise(r=>setTimeout(r,10)));}throw Error('Timed out waiting for Google Tasks');};
const click=async selector=>act(async()=>document.querySelector(selector).click());
const input=async(selector,value)=>act(async()=>{const field=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new window.Event('input',{bubbles:true}));});
const realFetch=globalThis.fetch;
test('hierarchy is ordered, cycle-safe, and includes orphaned subtasks',()=>{
 const rows=orderedGoogleTasks([{id:'child',parent:'parent',title:'Child',position:'2',status:'needsAction'},{id:'parent',title:'Parent',position:'1',status:'needsAction'},{id:'orphan',parent:'missing',title:'Orphan',position:'3',status:'needsAction'}]);assert.deepEqual(rows.map(r=>[r.task.id,r.depth]),[['parent',0],['child',1],['orphan',0]]);
 assert.equal(orderedGoogleTasks([{id:'a',parent:'b'},{id:'b',parent:'a'}]).length,2);
});
test('shared widget controller loads, creates once, completes, reopens, refreshes and preserves failed drafts',async()=>{
 let connected=true,creates=0,failCreate=false,tasks=[{id:'a',title:'Prepare notes',status:'needsAction',position:'1',due:'2026-11-04'},{id:'done',title:'Finished task',status:'completed',position:'2'}];
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url),path=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  assert.equal(options.headers.Authorization,'Bearer firebase-token');
  if(path==='status')return Response.json({configured:true,connected,connection:connected?'v1':'',email:'tasks@example.test'});
  if(path==='lists')return Response.json({items:[{id:'list',title:'My Tasks'},{id:'other',title:'Another list'}],nextPageToken:''});
  if(path==='tasks')return Response.json({items:u.searchParams.get('list')==='list'?tasks:[],nextPageToken:''});
  if(path==='create'){creates++;if(failCreate==='network')throw TypeError('Network lost');if(failCreate)return Response.json({error:'Quota reached',code:'rate_limit'},{status:429});tasks=[...tasks,{id:'new',title:body.title,status:'needsAction'}];return Response.json({task:tasks.at(-1)});}
  if(path==='complete'){tasks=tasks.map(t=>t.id===body.task?{...t,status:body.completed?'completed':'needsAction'}:t);return Response.json({task:tasks.find(t=>t.id===body.task)});}
  if(path==='disconnect'){connected=false;return Response.json({connected:false,revoked:true});}
  throw Error(path);
 };
 const user={uid:'alice',getIdToken:async()=> 'firebase-token'};function Host(){const [list,onList]=useState('');return React.createElement(GoogleTasksProvider,{user},React.createElement(GoogleTasksWidget,{listId:list,onList,disabled:false}),React.createElement(GoogleTasksConnection));}
 const root=createRoot(document.querySelector('#root'));
 try{
  await act(async()=>root.render(React.createElement(Host)));await wait(()=>document.querySelector('[aria-label="Complete Google task Prepare notes"]'));
  assert.match(document.querySelector('.google-tasks-account').textContent,/tasks@example/);
  await input('[aria-label="New Google task"]','New task');
  await act(async()=>{const form=document.querySelector('.google-tasks-add');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
  await wait(()=>document.querySelector('[aria-label="Complete Google task New task"]'));assert.equal(creates,1);assert.equal(document.querySelector('[aria-label="New Google task"]').value,'');
  await click('[aria-label="Complete Google task Prepare notes"]');await wait(()=>!document.querySelector('[aria-label="Complete Google task Prepare notes"]'));
  await click('.dash-expand');await wait(()=>document.querySelector('[aria-label="Reopen Google task Prepare notes"]'));
  await click('[aria-label="Reopen Google task Prepare notes"]');await wait(()=>document.querySelector('[aria-label="Complete Google task Prepare notes"]'));
  failCreate=true;await input('[aria-label="New Google task"]','Keep this draft');await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>document.querySelector('[role="alert"]'));assert.equal(document.querySelector('[aria-label="New Google task"]').value,'Keep this draft');
  failCreate='network';await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('may already'));assert.ok(document.querySelector('.google-tasks-add button').disabled);assert.equal(document.querySelector('[aria-label="New Google task"]').value,'Keep this draft');
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await act(async()=>window.dispatchEvent(new window.Event('offline')));assert.ok(document.querySelector('[aria-label="New Google task"]').disabled);
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await act(async()=>window.dispatchEvent(new window.Event('online')));
  window.confirm=()=>true;await click('.google-tasks-connection button');await wait(()=>document.querySelector('.google-tasks-widget .google-tasks-connection'));assert.equal(document.querySelector('.google-tasks-items'),null);
 }finally{globalThis.fetch=realFetch;await act(async()=>root.unmount());}
});
test('blocked popups and unconfigured connections give useful messages without requesting extra permissions',async()=>{
 globalThis.fetch=async()=>Response.json({configured:true,connected:false});window.open=()=>null;const root=createRoot(document.querySelector('#root'));
 try{await act(async()=>root.render(React.createElement(GoogleTasksProvider,{user:{uid:'bob',getIdToken:async()=> 'firebase-token'}},React.createElement(GoogleTasksConnection))));await wait(()=>!document.querySelector('button').disabled);await click('button');assert.match(document.querySelector('[role="alert"]').textContent,/Allow popups/);}finally{await act(async()=>root.unmount());globalThis.fetch=realFetch;}
});
test('popup completion accepts only the expected origin, window and state',async()=>{
 let connected=false,finishes=0;const state='expected-state',popup={closed:false,location:{href:''},close(){this.closed=true;}};window.open=()=>popup;
 globalThis.fetch=async(url)=>{const path=new URL(url).pathname.split('/').at(-1);if(path==='status')return Response.json({configured:true,connected,connection:connected?'v2':'',email:connected?'connected@test.example':''});if(path==='connect')return Response.json({state,url:'https://tasks.test/integrations/google-tasks/authorize?state='+state});if(path==='finish'){finishes++;connected=true;return Response.json({connected:true});}throw Error(path);};
 const root=createRoot(document.querySelector('#root'));
 try{
  await act(async()=>root.render(React.createElement(GoogleTasksProvider,{user:{uid:'alice',getIdToken:async()=> 'firebase-token'}},React.createElement(GoogleTasksConnection))));await wait(()=>!document.querySelector('button').disabled);await click('button');await wait(()=>popup.location.href.includes('authorize'));
  const send=async(origin,source,stateValue)=>act(async()=>window.dispatchEvent(new window.MessageEvent('message',{origin,source,data:{type:'remo-google-tasks',state:stateValue,completion:'proof'}})));
  await send('https://evil.example',popup,state);await send('https://tasks.test',{},state);await send('https://tasks.test',popup,'wrong');assert.equal(finishes,0);
  await send('https://tasks.test',popup,state);await wait(()=>document.querySelector('.google-tasks-connection').textContent.includes('Connected as'));assert.equal(finishes,1);
 }finally{await act(async()=>root.unmount());globalThis.fetch=realFetch;}
});
test('late task-list responses cannot replace the currently selected list',async()=>{
 let release;globalThis.fetch=async(url)=>{const u=new URL(url),path=u.pathname.split('/').at(-1);if(path==='status')return Response.json({configured:true,connected:true,connection:'v1',email:'tasks@test.example'});if(path==='lists')return Response.json({items:[{id:'a',title:'List A'},{id:'b',title:'List B'}],nextPageToken:''});if(path==='tasks'&&u.searchParams.get('list')==='a')return new Promise(r=>{release=r;});return Response.json({items:[{id:'b-task',title:'List B task',status:'needsAction'}],nextPageToken:''});};
 function Host(){const [list,onList]=useState('');return React.createElement(GoogleTasksProvider,{user:{uid:'alice',getIdToken:async()=> 'firebase-token'}},React.createElement(GoogleTasksWidget,{listId:list,onList,disabled:false}));}
 const root=createRoot(document.querySelector('#root'));
 try{
  await act(async()=>root.render(React.createElement(Host)));await wait(()=>release);
  await act(async()=>{const select=document.querySelector('select');select.value='b';select.dispatchEvent(new window.Event('change',{bubbles:true}));});await wait(()=>document.querySelector('[aria-label="Complete Google task List B task"]'));
  await act(async()=>release(Response.json({items:[{id:'a-task',title:'Late list A task',status:'needsAction'}],nextPageToken:''})));
  assert.equal(document.querySelector('[aria-label="Complete Google task Late list A task"]'),null);
 }finally{await act(async()=>root.unmount());globalThis.fetch=realFetch;}
});
