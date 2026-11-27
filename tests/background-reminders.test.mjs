import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const storage=new Map(),messages=[],calls=[];let permissionCalls=0,sub=null,subscriptions=0,unsubscribes=0;
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.__pushAuth={currentUser:{uid:'alice',getIdToken:async()=> 'fixture-token'}};
globalThis.window={PushManager:class{}};globalThis.Notification=class{static permission='granted';static async requestPermission(){permissionCalls++;return this.permission;}};
const reg={active:{postMessage:m=>messages.push(m)},pushManager:{async getSubscription(){return sub;},async subscribe(){subscriptions++;sub={toJSON:()=>({endpoint:'https://fcm.googleapis.com/a',keys:{}}),async unsubscribe(){unsubscribes++;sub=null;return true;}};return sub;}}};
Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:{ready:Promise.resolve(reg),getRegistration:async()=>reg}},configurable:true});
globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);return Response.json(body.action==='key'?{publicKey:'A'.repeat(87)}:{enabled:true});};
await build({entryPoints:['src/background-reminders.ts'],bundle:true,packages:'external',outfile:'tests/.build/background-client-fixture.mjs',format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/(auth-service|cloud-config|data)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./auth-service'?'export const auth=globalThis.__pushAuth;':a.path==='./cloud-config'?`export const CLOUD_API='https://api.example.test';`:`export const accountLocalKey=k=>globalThis.__pushAuth.currentUser.uid+':'+k;`}));}}]});
const client=await import('./.build/background-client-fixture.mjs');
test('opt-in permission is explicit; renewal reuses the subscription; sign-out revokes locally before server removal',async()=>{
 assert.equal(permissionCalls,0);await client.enableBackgroundReminders();assert.equal(permissionCalls,1);assert.equal(subscriptions,1);assert.equal(client.backgroundEnabled(),true);const id=storage.get('alice:background-reminder-device');assert.equal(messages.at(-1).id,id);
 await client.enableBackgroundReminders(true);assert.equal(permissionCalls,1);assert.equal(subscriptions,1);
 await client.disableBackgroundReminders();assert.equal(unsubscribes,1);assert.equal(client.backgroundEnabled(),false);assert.deepEqual(calls.at(-1),{action:'remove',id});assert.equal(messages.at(-1).id,null);
 Notification.permission='denied';await assert.rejects(client.enableBackgroundReminders(),/blocked/);assert.equal(client.backgroundEnabled(),false);assert.equal(subscriptions,1);
});
test('another account cannot inherit a device preference and failed registration leaves no active delivery',async()=>{
 Notification.permission='granted';__pushAuth.currentUser={uid:'bob',getIdToken:async()=> 'fixture-token'};assert.equal(client.backgroundEnabled(),false);const original=globalThis.fetch;globalThis.fetch=async(url,init)=>JSON.parse(init.body).action==='key'?original(url,init):Response.json({error:'temporarily unavailable'},{status:503});
 await assert.rejects(client.enableBackgroundReminders(),/temporarily unavailable/);assert.equal(client.backgroundEnabled(),false);assert.equal(sub,null);globalThis.fetch=original;
});
test('travel updates the registered zone on focus renewal without another permission prompt',async()=>{
 Notification.permission='granted';await client.enableBackgroundReminders();const permissionBefore=permissionCalls,Original=Intl.DateTimeFormat;
 try{Intl.DateTimeFormat=function(...args){const f=new Original(...args);f.resolvedOptions=()=>({timeZone:'Asia/Kolkata'});return f;};await client.renewBackgroundReminders();assert.equal(calls.at(-1).zone,'Asia/Kolkata');assert.equal(permissionCalls,permissionBefore);}
 finally{Intl.DateTimeFormat=Original;await client.disableBackgroundReminders();}
});
