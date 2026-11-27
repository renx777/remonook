import test from 'node:test';import assert from 'node:assert/strict';
import {syncSpaces} from './helpers/sync-space.mjs';import {validateSubscription,reminderPushRoute} from '../cloud/reminder-push.mjs';
import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';import {empty} from './.build/data.mjs';import {saveCalendarEvent} from '../src/calendar-events.mjs';
const origin='https://staging.remonook.com',b64=bytes=>Buffer.from(bytes).toString('base64url');
async function device(){const k=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {id:crypto.randomUUID(),origin,zone:'UTC',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',k.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}}};}
async function call(ns,uid,path,body){const r=await ns.get(uid).fetch(new Request('https://space'+path,{method:body?'POST':'GET',headers:{'X-Remo-Uid':uid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;}
async function setup(){const env={ALLOWED_ORIGINS:origin},ns=syncSpaces(env),initial=await call(ns,'alice','/pull'),states=mergeUpdates(new Map(),initial.updates),doc=projectBuckets(states).doc,planned=saveCalendarEvent(doc,{title:'Private medical title',kind:'other',date:'2026-11-27',time:'09:00',repeat:'daily',leadDays:1,notes:''},()=> 'e');const next=applyDocument(states,doc,planned);await call(ns,'alice','/push',{operationId:crypto.randomUUID(),updates:next.updates,since:initial.revision});return {ns,space:ns.live.get('alice'),states:next.states,doc:planned};}
test('push endpoints, identities, origin and encryption keys are constrained',async()=>{const d=await device();assert.equal(validateSubscription(d,[origin]).id,d.id);for(const endpoint of ['https://127.0.0.1/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com:444/a','https://user@fcm.googleapis.com/a'])assert.throws(()=>validateSubscription({...d,subscription:{...d.subscription,endpoint}},[origin]));assert.throws(()=>validateSubscription({...d,zone:'Invalid/Zone'},[origin]));assert.throws(()=>validateSubscription(d,[]));assert.throws(()=>validateSubscription({...d,subscription:{...d.subscription,keys:{auth:'x',p256dh:'x'}}},[origin]));});
test('alarms deliver encrypted generic payloads once, isolate accounts and remove expired endpoints',async()=>{
 const realNow=Date.now,realFetch=globalThis.fetch;Date.now=()=>Date.parse('2026-11-27T10:00Z');let calls=[];
 try{const {ns,space}=await setup(),d=await device(),publicKey=await call(ns,'alice','/reminders',{action:'key'});assert.deepEqual(Object.keys(publicKey),['publicKey']);assert.equal(publicKey.publicKey.length,87);assert.equal((await call(ns,'alice','/reminders',{action:'key'})).publicKey,publicKey.publicKey);
 await call(ns,'alice','/reminders',d);assert.ok(space.ctx.alarm);assert.equal((await call(ns,'bob','/reminders',{action:'key'})).publicKey===publicKey.publicKey,false);assert.equal(ns.live.get('bob').reminders.devices().length,0);
 space.read=()=>{throw Error('A reminder alarm must not read the full workspace');};globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(null,{status:201});};await space.alarm();assert.equal(calls.length,1);assert.equal(calls[0].init.redirect,'error');assert.ok(!Buffer.from(calls[0].init.body).includes(Buffer.from('Private medical title')));assert.match(calls[0].init.headers.Authorization||calls[0].init.headers.authorization,/vapid/);await space.alarm();assert.equal(calls.length,1);
 await call(ns,'alice','/reminders',{action:'remove',id:d.id});assert.equal(space.ctx.alarm,null);await call(ns,'alice','/reminders',{...d,id:crypto.randomUUID()});globalThis.fetch=async()=>new Response(null,{status:410});await space.alarm();assert.equal(space.reminders.devices().length,0);
 }finally{Date.now=realNow;globalThis.fetch=realFetch;}
});
test('temporary push failure retains pending delivery; ordinary text does not wake alarms',async()=>{
 const realNow=Date.now,realFetch=globalThis.fetch;let now=Date.parse('2026-11-27T10:00Z');Date.now=()=>now;
 try{const {ns,space,states,doc}=await setup(),d=await device();await call(ns,'alice','/reminders',d);globalThis.fetch=async()=>new Response(null,{status:503});await space.alarm();assert.equal(space.reminders.receipts(d.id).length,0);assert.equal(space.reminders.devices()[0].failures,1);
 now+=61000;globalThis.fetch=async()=>new Response(null,{status:201});await space.alarm();assert.equal(space.reminders.receipts(d.id).length,1);
 const before=space.ctx.alarmWrites,changed={...doc,web:{...doc.web,example:'Unrelated typing metadata'}};const delta=applyDocument(states,doc,changed);await call(ns,'alice','/push',{operationId:crypto.randomUUID(),updates:delta.updates,since:0});assert.equal(space.ctx.alarmWrites,before);
 }finally{Date.now=realNow;globalThis.fetch=realFetch;}
});
test('older forms cannot strip daily mode but explicit false and deletion are accepted',async()=>{
 const {ns,states,doc}=await setup();const old={...doc,web:{...doc.web,calendarEvents:doc.web.calendarEvents.map(({daily,...e})=>({...e,title:'Changed on old client'}))}},patch=applyDocument(states,doc,old);
 let response=await call(ns,'alice','/push',{operationId:crypto.randomUUID(),updates:patch.updates,since:0});let merged=mergeUpdates(patch.states,response.updates),current=projectBuckets(merged).doc;assert.equal(current.web.calendarEvents[0].daily,true);
 const stopped={...current,web:{...current.web,calendarEvents:current.web.calendarEvents.map(e=>({...e,daily:false}))}},off=applyDocument(merged,current,stopped);response=await call(ns,'alice','/push',{operationId:crypto.randomUUID(),updates:off.updates,since:0});merged=mergeUpdates(off.states,response.updates);assert.equal(projectBuckets(merged).doc.web.calendarEvents[0].daily,false);
});
test('device budget and lease expiry are bounded and calendar completion invalidates the alarm',async()=>{
 const realNow=Date.now;let now=Date.parse('2026-11-27T10:00Z');Date.now=()=>now;
 try{const {ns,space,states,doc}=await setup(),d=await device();for(let i=0;i<8;i++)await call(ns,'alice','/reminders',{...d,id:crypto.randomUUID()});
 const r=await ns.get('alice').fetch(new Request('https://space/reminders',{method:'POST',headers:{'X-Remo-Uid':'alice','Content-Type':'application/json'},body:JSON.stringify(d)}));assert.equal(r.status,409);
 const before=space.ctx.alarmWrites,done={...doc,web:{...doc.web,calendarEvents:doc.web.calendarEvents.map(e=>({...e,completions:{'2026-11-27':true}}))}},delta=applyDocument(states,doc,done);await call(ns,'alice','/push',{operationId:crypto.randomUUID(),updates:delta.updates,since:0});assert.ok(space.ctx.alarmWrites>before);
 now+=31*86400000;await space.alarm();assert.equal(space.reminders.devices().length,0);assert.equal(space.ctx.alarm,null);
 }finally{Date.now=realNow;}
});
test('alarm storage failures remain retryable without blocking acknowledged notes or pull',async()=>{
 const {ns,space,states,doc}=await setup();await call(ns,'alice','/reminders',await device());space.ctx.storage.setAlarm=async()=>{throw Error('Alarm service unavailable');};space.setMeta('reminder_dirty','1');
 const pulled=await call(ns,'alice','/pull');assert.ok(pulled.revision);const next={...doc,web:{...doc.web,example:'An independent note setting'}},changed=applyDocument(states,doc,next),op=crypto.randomUUID();const pushed=await call(ns,'alice','/push',{operationId:op,updates:changed.updates,since:0});assert.equal(pushed.acked,op);assert.equal((await call(ns,'alice','/read')).doc.web.example,'An independent note setting');assert.equal(space.meta('reminder_dirty'),'1');
});
