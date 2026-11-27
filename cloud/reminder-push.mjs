import {leafBucket} from '../src/sync-buckets.mjs';
import {assembleParts} from '../src/sync-crdt.mjs';
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {reminderSchedule,reminderFieldsChanged} from '../src/reminder-schedule.mjs';
export {reminderFieldsChanged};
const LEASE=30*86400000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function validateSubscription(input,allowed){
 if(!input||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/.test(input.id)||!allowed.includes(input.origin))fail('Invalid reminder device');
 try{new Intl.DateTimeFormat('en',{timeZone:input.zone}).format();}catch{fail('Invalid reminder time zone');}
 if(typeof input.zone!=='string'||input.zone.length>100)fail('Invalid reminder time zone');
 const s=input.subscription;let url;try{url=new URL(s.endpoint);}catch{fail('Invalid push subscription');}
 const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||s.endpoint.length>2048||!hosts.includes(url.hostname)&&!url.hostname.endsWith('.push.services.mozilla.com')&&!url.hostname.endsWith('.notify.windows.com'))fail('Unsupported push service');
 if(!s.keys||!/^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh)||!/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth))fail('Invalid push keys');
 return {id:input.id,origin:input.origin,zone:input.zone,subscription:{endpoint:url.href,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}}};
}
export class ReminderPush {
 constructor(space){this.s=space;space.sql.exec('CREATE TABLE IF NOT EXISTS reminder_devices(id TEXT PRIMARY KEY, body TEXT NOT NULL)');space.sql.exec('CREATE TABLE IF NOT EXISTS reminder_receipts(device TEXT NOT NULL, day TEXT NOT NULL, part INTEGER NOT NULL, keys TEXT NOT NULL, PRIMARY KEY(device,day,part))');}
 scheduleDoc(){
  const rows=this.s.sql.exec(`WITH RECURSIVE timed(k,body) AS (
   SELECT k,body FROM records WHERE tbl='bullets' AND json_extract(body,'$.taskState')='TODO' AND json_extract(body,'$.taskStartTime')!=''
   UNION SELECT r.k,r.body FROM records r JOIN timed t ON r.k=json_array('bullets',json_extract(t.body,'$.parentId')) WHERE r.tbl='bullets'
  ) SELECT body FROM timed`).toArray().map(r=>JSON.parse(r.body));
  const fields=this.s.load(leafBucket(JSON.stringify(['web','calendarEvents']))).parts.rootFields.filter(f=>f.path[0]==='web'&&f.path[1]==='calendarEvents');
  const doc=assembleParts([{rootFields:fields,rows:[],tables:[],assets:[]}]).doc;doc.tables.bullets=rows;return doc;
 }
 receipts(id){return this.s.sql.exec('SELECT keys FROM reminder_receipts WHERE device=?',id).toArray().flatMap(r=>JSON.parse(r.keys));}
 devices(){return this.s.sql.exec('SELECT body FROM reminder_devices').toArray().map(r=>JSON.parse(r.body));}
 async keys(){let v=this.s.meta('reminder_vapid');if(v)return JSON.parse(v);const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const priv=await crypto.subtle.exportKey('jwk',key.privateKey);const out={publicKey:b64(await crypto.subtle.exportKey('raw',key.publicKey)),privateKey:priv.d,subject:'https://remonook.com'};this.s.setMeta('reminder_vapid',JSON.stringify(out));return out;}
 async nudge(){if(!this.devices().length){if(this.s.meta('reminder_dirty')==='1')this.s.setMeta('reminder_dirty','0');return;}this.s.setMeta('reminder_dirty','1');await this.s.ctx.storage.setAlarm(Date.now()+1000);}
 async request(input){
  if(input.action==='key')return {publicKey:(await this.keys()).publicKey};
  if(input.action==='remove'){
   if(typeof input.id!=='string'||input.id.length>100)fail('Invalid reminder device');this.s.sql.exec('DELETE FROM reminder_devices WHERE id=?',input.id);this.s.sql.exec('DELETE FROM reminder_receipts WHERE device=?',input.id);
   if(!this.devices().length){this.s.setMeta('reminder_dirty','0');await this.s.ctx.storage.deleteAlarm();}return {enabled:false};
  }
  const device=validateSubscription(input,(this.s.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()));
  if(!this.devices().some(d=>d.id===device.id)&&this.devices().length>=8)fail('Eight reminder devices are already registered. Disable an unused device first.',409);
  // Ensure malformed EC points cannot create a permanently failing delivery loop.
  try{await crypto.subtle.importKey('raw',Uint8Array.from(atob(device.subscription.keys.p256dh.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{fail('Invalid push keys');}
  const previous=this.devices().find(d=>d.id===device.id),changed=previous?.subscription.endpoint!==device.subscription.endpoint||previous.zone!==device.zone;
  this.s.sql.exec('INSERT INTO reminder_devices(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',device.id,JSON.stringify({...device,expires:Date.now()+LEASE,failures:0,retryAt:0}));
  if(changed)this.s.sql.exec('DELETE FROM reminder_receipts WHERE device=?',device.id);await this.nudge();return {enabled:true,expires:Date.now()+LEASE};
 }
 async alarm(){
  // Compute under the same account queue; network delivery is outside it so a
  // slow push provider cannot hold up ordinary sync commits.
  const jobs=await this.s.serial(async()=>{
   const now=Date.now(),doc=this.scheduleDoc(),out=[];let next=Infinity;
   for(const d of this.devices()){
    if(d.expires<=now){this.s.sql.exec('DELETE FROM reminder_devices WHERE id=?',d.id);this.s.sql.exec('DELETE FROM reminder_receipts WHERE device=?',d.id);continue;}
    const receipts=new Set(this.receipts(d.id)),plan=reminderSchedule(doc,d.zone,now,receipts);
    this.s.sql.exec('DELETE FROM reminder_receipts WHERE device=? AND day!=?',d.id,plan.today);next=Math.min(next,plan.next,d.expires);
    if(plan.due.length){if(d.retryAt>now)next=Math.min(next,d.retryAt);else {out.push({device:d,plan});next=Math.min(next,now+60000);}}
   }
   if(Number.isFinite(next))await this.s.ctx.storage.setAlarm(Math.max(now+1000,next));else await this.s.ctx.storage.deleteAlarm();this.s.setMeta('reminder_dirty','0');return out;
  });
  if(!jobs.length)return;const keys=await this.s.serial(()=>this.keys());
  await Promise.all(jobs.map(async({device:d,plan})=>{
   let status=0;try{const payload=await buildPushPayload({data:JSON.stringify({type:'reminder',date:plan.today,device:d.id,count:plan.due.length}),options:{ttl:3600}},d.subscription,keys);const r=await fetch(d.subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(8000)});status=r.status;await r.body?.cancel();}catch{/* Keep pending delivery, never expose endpoint/key details. */}
   await this.s.serial(async()=>{
    const live=this.devices().find(x=>x.id===d.id);if(!live||live.subscription.endpoint!==d.subscription.endpoint||live.zone!==d.zone)return;
    if(status===404||status===410){this.s.sql.exec('DELETE FROM reminder_devices WHERE id=?',d.id);this.s.sql.exec('DELETE FROM reminder_receipts WHERE device=?',d.id);return;}
    if(status>=200&&status<300){const seen=[...new Set([...this.receipts(d.id),...plan.due.map(i=>i.key)])],prior=new Map(this.s.sql.exec('SELECT part,keys FROM reminder_receipts WHERE device=? AND day=?',d.id,plan.today).toArray().map(r=>[r.part,r.keys]));
     this.s.ctx.storage.transactionSync(()=>{for(let i=0,part=0;i<seen.length;i+=128,part++){const keys=JSON.stringify(seen.slice(i,i+128));if(prior.get(part)!==keys)this.s.sql.exec('INSERT INTO reminder_receipts(device,day,part,keys) VALUES(?,?,?,?) ON CONFLICT(device,day,part) DO UPDATE SET keys=excluded.keys',d.id,plan.today,part,keys);}});live.failures=0;live.retryAt=0;}
    else {live.failures=(live.failures||0)+1;live.retryAt=Date.now()+Math.min(3600000,60000*2**Math.min(live.failures-1,6));}
    this.s.sql.exec('UPDATE reminder_devices SET body=? WHERE id=?',JSON.stringify(live),d.id);
   });
  }));
 }
}
export async function reminderPushRoute(request,env,uid,readLimited){
 if(!env.SYNC_SPACE)return Response.json({error:'Background reminders require sync v3.'},{status:503});
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 let input;try{input=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));}catch(e){if(e.status)throw e;fail('Invalid reminder request');}if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid reminder request');input.origin=request.headers.get('Origin');
 return env.SYNC_SPACE.get(env.SYNC_SPACE.idFromName(uid)).fetch(new Request('https://space/reminders',{method:'POST',headers:{'X-Remo-Uid':uid,'Content-Type':'application/json'},body:JSON.stringify(input)}));
}
