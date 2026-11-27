// Synthetic Chrome push in an isolated guest profile; no account or subscription is created.
// This verifies browser worker behavior, not external FCM/APNs delivery.
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const origin=process.env.REMINDER_WORKER_URL||'http://127.0.0.1:5212';if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)&&origin!=='https://staging.remonook.com')throw Error('Local or staging only.');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox',...(process.env.REMINDER_IGNORE_TLS?['--ignore-certificate-errors']:[])]});
try{
 const context=await browser.newContext({permissions:['notifications'],...(process.env.REMINDER_IGNORE_TLS?{ignoreHTTPSErrors:true}:{})}),control=await context.newPage(),cdp=await context.newCDPSession(control),registrations=new Map();
 cdp.on('ServiceWorker.workerRegistrationUpdated',({registrations:rows})=>{for(const row of rows)registrations.set(row.registrationId,row);});await cdp.send('ServiceWorker.enable');
 const page=await context.newPage();await page.goto(origin);const guest=page.getByText('Try as a guest',{exact:true});if(await guest.isVisible())await guest.click();
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');let timer;try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Worker activation timed out')),45000);})]);}finally{clearTimeout(timer);}});
 const device=crypto.randomUUID();await page.evaluate(async id=>{const reg=await navigator.serviceWorker.ready;await new Promise((resolve,reject)=>{const c=new MessageChannel(),timer=setTimeout(()=>reject(Error('Worker guard acknowledgement timed out')),10000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();e.data.ok&&e.data.protocol===1?resolve():reject(Error('Unexpected worker protocol'));};reg.active.postMessage({type:'REMINDER_DEVICE',id},[c.port2]);});},device);
 const deadline=Date.now()+15000;while(![...registrations.values()].some(r=>r.scopeURL===origin+'/'&&!r.isDeleted)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 const registration=[...registrations.values()].find(r=>r.scopeURL===origin+'/'&&!r.isDeleted);assert.ok(registration,'The browser registered the worker');
 await page.close();assert.equal(context.pages().filter(p=>p.url().startsWith(origin)).length,0,'No app tab remains open');
 await cdp.send('ServiceWorker.deliverPushMessage',{origin,registrationId:registration.registrationId,data:JSON.stringify({type:'reminder',device,date:new Date().toISOString().slice(0,10),count:1})});
 let notifications=[];const until=Date.now()+15000;while(Date.now()<until){for(const worker of context.serviceWorkers())if(worker.url().startsWith(origin)){notifications=await worker.evaluate(async()=> (await self.registration.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag}))).catch(()=>[]);if(notifications.length)break;}if(notifications.length)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(notifications.length,1);assert.equal(notifications[0].title,'RemoNook');assert.match(notifications[0].body,/scheduled reminder/);assert.equal(notifications[0].tag,'remo-reminders');console.log('Synthetic browser push: notification displayed with no app tab; device guard acknowledgement passed. External provider/OS delivery remains a physical-device check.');
 await context.close();
}finally{await browser.close();}
