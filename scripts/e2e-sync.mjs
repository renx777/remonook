// End-to-end sync check against a deployed environment, with real browsers as separate devices.
//
// It signs a dedicated test account in on brand-new devices and checks the cases that must never
// regress: a new device receives every note and deletes nothing, edits and new notes reach other
// devices live, an offline edit syncs after reconnecting, and concurrent edits to one bullet
// converge with both kept. At the end it removes only its own bullets (text starting with
// MARK) and checks that the account holds exactly the notes it had before.
//
//   E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e-sync.mjs            (staging)
//   E2E_URL / E2E_API override the app and sync URLs. Production needs E2E_ALLOW_PRODUCTION=1.
//
// Credentials come only from the environment (GitHub secrets in CI). Nothing is written to disk.
import {chromium} from 'playwright';
import {applyDocument,mergeUpdates,projectBuckets,openBucket,bulletBucket} from '../src/sync-buckets.mjs';
import {bullet} from '../src/domain.mjs';

const APP=process.env.E2E_URL||'https://staging.remonook.com';
const API=process.env.E2E_API||'https://remo-sync-staging.remo-978fb.workers.dev';
const EMAIL=process.env.E2E_EMAIL,PASSWORD=process.env.E2E_PASSWORD;
const MARK='E2E sync check',RUN=`${MARK} ${new Date().toISOString().slice(0,16)} ${Math.random().toString(36).slice(2,6)}`;
if(!EMAIL||!PASSWORD){console.error('Set E2E_EMAIL and E2E_PASSWORD (a dedicated test account).');process.exit(2);}
if(/\/\/remonook\.com/.test(APP)&&process.env.E2E_ALLOW_PRODUCTION!=='1'){console.error('Refusing to run against production without E2E_ALLOW_PRODUCTION=1.');process.exit(2);}

const results=[];let token=null;
const check=(name,ok,detail='')=>{results.push({name,ok});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  ('+detail+')':''}`);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- the account as the sync server holds it (same code the app uses)
async function server(){
 let states=new Map(),since=0,after='',target='';
 for(;;){
  const r=await fetch(`${API}/sync/v3?since=${since}&after=${encodeURIComponent(after)}&target=${encodeURIComponent(target)}`,{headers:{Authorization:token,Origin:APP}});
  if(!r.ok)throw Error(`pull failed: ${r.status}`);
  const j=await r.json();states=mergeUpdates(states,j.updates);
  if(!j.more)return {states,revision:j.revision,doc:projectBuckets(states).doc};
  after=j.after||'';target=String(j.target||'');if(!j.after)since=j.revision;
 }
}
const ours=n=>n.text.startsWith(MARK);
/** This run's bullets, or leftovers from a run that started over 30 minutes ago (a run in
 progress elsewhere, for example staging and a release at once, is left alone). */
const removable=n=>{if(n.text.startsWith(RUN))return true;const m=n.text.slice(MARK.length+1,MARK.length+17);const t=Date.parse(m+':00Z');return ours(n)&&(!Number.isFinite(t)||Date.now()-t>30*60000);};
/** Deletes every bullet this check ever created (and their children), through normal sync. */
async function cleanup(){
 const {states,revision,doc}=await server(),drop=new Set(doc.tables.bullets.filter(removable).map(n=>n.id));
 let grew=true;while(grew){grew=false;for(const n of doc.tables.bullets)if(n.parentId&&drop.has(n.parentId)&&!drop.has(n.id)){drop.add(n.id);grew=true;}}
 if(!drop.size)return 0;
 const next={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.filter(n=>!drop.has(n.id))}};
 const {updates}=applyDocument(states,doc,next,{clientID:Math.floor(Math.random()*2**31)});
 const r=await fetch(`${API}/sync/v3`,{method:'POST',headers:{Authorization:token,Origin:APP,'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),updates,since:revision})});
 if(!r.ok)throw Error(`cleanup failed: ${r.status} ${await r.text()}`);
 return drop.size;
}

/** Remove only untouched fixtures created by the retired baseline seeder. */
async function removeLegacyBaseline(){
 const {states,revision,doc}=await server();
 const referenced=new Set(doc.tables.bullets.flatMap(n=>[n.parentId,n.mirrorSourceId]));
 for(const row of [...doc.tables.media,...doc.tables.decks]){referenced.add(row.bulletId);referenced.add(row.rootId);}
 // Position normalization and its bookkeeping timestamps are routine on outline edits.
 const {noteTimes,...sharedMetadata}=doc.web;
 const metadata=JSON.stringify(sharedMetadata);
 const drop=new Set();
 let found=0;
 for(let k=1;k<=5;k++){
  const id='e2e-baseline-'+k;
  const node=doc.tables.bullets.find(n=>n.id===id);
  if(node)found++;
  const original=bullet(id,{text:`Sync check baseline note ${k} (keep)`,position:100+k});
  if(node && !referenced.has(id) && !metadata.includes(JSON.stringify(id)) &&
     Object.entries(node).every(([key,value])=>key==='position'||key==='collapsed'||value===original[key]) &&
     node.text===original.text && node.parentId===null) drop.add(id);
 }
 console.log(`legacy baseline fixtures: ${found} found, ${drop.size} untouched, ${found-drop.size} retained`);
 if(!drop.size)return;
 const next={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.filter(n=>!drop.has(n.id))}};
 const {updates}=applyDocument(states,doc,next,{clientID:Math.floor(Math.random()*2**31)});
 const r=await fetch(`${API}/sync/v3`,{method:'POST',headers:{Authorization:token,Origin:APP,'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),updates,since:revision})});
 if(!r.ok)throw Error(`baseline cleanup failed: ${r.status}`);
 const after=(await server()).doc.tables.bullets;
 if(after.some(n=>drop.has(n.id)))throw Error('Untouched baseline notes remain after cleanup');
 console.log(`removed ${drop.size} legacy baseline notes`);
}

// ---- devices: a fresh browser context each, so no shared storage
/** What the page shows when something goes wrong, for the log. */
const describe=page=>page.evaluate(()=>{const visible=[...document.querySelectorAll('[role=alert],[role=status],.save-status,.access-error,h1,h2')].filter(e=>e.offsetParent||e.classList.contains('save-status')).map(e=>(e.title||e.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);return visible.slice(0,6).join(' | ')||document.body.innerText.slice(0,200);}).catch(e=>'page unavailable: '+e.message);
/** `hold` (optional) is a promise: until it resolves, this device's changes are not sent, so the
 account can be recorded exactly as it was before the device's first sync. */
async function device(browser,name,hold){
 const ctx=await browser.newContext({viewport:{width:1280,height:850}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!token&&r.url().startsWith(API+'/sync/v3'))token=r.headers().authorization||null;});
 if(hold)await page.route(url=>url.href.startsWith(API+'/sync/v3'),async route=>{if(route.request().method()==='POST')await hold;await route.continue();});
 await page.goto(APP+'/#app');await page.waitForSelector('[aria-label="Account: not signed in"]',{timeout:30000});
 await page.click('[aria-label="Account: not signed in"]');await page.getByText(/Sign in or create account/i).first().click();
 await page.fill('input[type=email]',EMAIL);await page.fill('input[type=password]',PASSWORD);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 // Signed in and synced, or a visible sign-in error (for example a wrong password secret).
 const outcome=await page.waitForFunction(()=>{const e=document.querySelector('.access-error');if(e&&e.offsetParent)return 'error:'+e.textContent.trim();return document.querySelector('.save-status')?.title.includes('Cloud: Synced')?'synced':false;},null,{timeout:90000}).then(h=>h.jsonValue(),async()=>'timeout: '+await describe(page));
 if(outcome!=='synced'){await page.screenshot({path:`e2e-failure-${name}.png`}).catch(()=>{});throw Error(`device ${name} sign-in ${outcome}`);}
 await sleep(1500);
 return {name,ctx,page,errors};
}
const status=d=>d.page.evaluate(()=>document.querySelector('.save-status')?.title||'');
const synced=(d,timeout=60000)=>d.page.waitForFunction(()=>document.querySelector('.save-status')?.title.includes('Cloud: Synced'),null,{timeout});
// Accounts can be large and the outline only renders rows on screen, so the check reads and
// edits its notes through the app's search, which filters the outline to matching bullets.
async function search(d,q){const box=d.page.locator('input[placeholder="Search notes"]');
 // In a narrower top bar (an open sidebar at this window size) search folds into an icon; open it first.
 if(!(await box.isVisible())){const open=d.page.getByRole('button',{name:'Open search'}).first();if(await open.isVisible())await open.click();}
 if(await box.inputValue()!==q){await box.fill(q);await sleep(700);}await box.press('Escape');await sleep(250);
 // Escape closes the suggestions; if it also cleared the search, set it again without focus.
 if(await box.inputValue()!==q){await box.evaluate((e,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();},q);await sleep(700);}
 if(await d.page.locator('text=Combine terms').isVisible().catch(()=>false))throw Error('the search suggestions stayed open');}
const rows=d=>d.page.evaluate(()=>[...document.querySelectorAll('[data-node-id]')].map(e=>(e.querySelector('.tiptap')||e.querySelector('.text-button')||e).textContent.trim()));
const texts=async d=>{await search(d,RUN);return rows(d);};
async function waitFor(d,test,ms=20000){const t=Date.now();while(Date.now()-t<ms){if(test(await texts(d)))return Date.now()-t;await sleep(150);}return -1;}
async function add(d,text){await search(d,'');await d.page.click('[aria-label="Add bullet"]');await d.page.waitForSelector('.tiptap');await d.page.keyboard.type(text);await d.page.keyboard.press('Escape');await sleep(300);}
async function append(d,match,text){await search(d,RUN);const row=d.page.locator('[data-node-id]',{hasText:match}).first();await row.locator('.text-button').click();await d.page.waitForSelector('.tiptap');await d.page.keyboard.press('End');await d.page.keyboard.type(text);await d.page.keyboard.press('Escape');await sleep(300);}
async function online(d,on){await d.ctx.setOffline(!on);if(on)await d.page.evaluate(()=>window.dispatchEvent(new Event('online')));}

const browser=await chromium.launch(process.env.E2E_CHROMIUM?{executablePath:process.env.E2E_CHROMIUM}:{});
let before=null,baselineRows=new Map();
// IDs/structure only: never log account note text or a workspace snapshot.
function missingDetail(snapshot){
 const present=new Set(snapshot.doc.tables.bullets.map(n=>n.id)),missing=before.filter(id=>!present.has(id));
 return JSON.stringify(missing.slice(0,20).map(id=>{
  const prior=baselineRows.get(id),d=openBucket(snapshot.states.get(bulletBucket(id))),key=JSON.stringify(['bullets',id]);
  try{const deleted=d.getMap('fields').get(JSON.stringify(['row',key,'_syncDeletedValue']));
   return {id,parentId:prior?.parentId,mirror:!!prior?.mirrorSourceId,textLength:prior?.text?.length,existsFlag:d.getMap('rows').get(key)??null,deletionRecord:!!deleted,deletedFields:deleted?Object.keys(deleted).filter(k=>JSON.stringify(deleted[k])!==JSON.stringify(prior?.[k])):[]};
  }finally{d.destroy();}
 }));
}
try{
 // Device A signs in, but sends nothing until the account has been recorded: a first sync that
 // deletes or reverts notes must be visible to the checks below.
 let release;const hold=new Promise(r=>release=r);
 const signingIn=device(browser,'A',hold);
 let signInError=null;signingIn.catch(e=>{signInError=e;});
 for(let i=0;i<900&&!token&&!signInError;i++)await sleep(100);
 if(!token)throw signInError||Error('device A did not reach the sync server within 90 s');
 if(APP==='https://staging.remonook.com' && API==='https://remo-sync-staging.remo-978fb.workers.dev') await removeLegacyBaseline();
 const baseline=(await server()).doc.tables.bullets.filter(n=>!n.text.startsWith(MARK));baselineRows=new Map(baseline.map(n=>[n.id,n]));before=baseline.map(n=>n.id).sort();
 console.log(`account has ${before.length} notes`);
 release();const A=await signingIn;
 const leftovers=await cleanup();if(leftovers)console.log(`removed ${leftovers} bullets left by an earlier check`);
 const afterA=(await server()).doc.tables.bullets;
 check('the first device\'s sign-in deletes nothing',before.every(id=>afterA.some(n=>n.id===id)),`${before.filter(id=>afterA.some(n=>n.id===id)).length}/${before.length} notes`);

 // 1. A creates notes; a brand-new device B receives all of them and deletes nothing.
 for(const k of [1,2,3]){await add(A,`${RUN} n${k}`);await synced(A,30000);const snapshot=await server();const count=before.filter(id=>snapshot.doc.tables.bullets.some(n=>n.id===id)).length;check(`adding note ${k} preserves earlier notes`,count===before.length,`${count}/${before.length}`+(count===before.length?'':' missing='+missingDetail(snapshot)));}
 const B=await device(browser,'B');
 const seen=(await texts(B)).filter(t=>t.startsWith(RUN)).length;
 const afterBSnapshot=await server(),afterB=afterBSnapshot.doc.tables.bullets;
 check('a new device receives every note',seen===3,`${seen}/3 new notes shown`);
 check('a new device deletes nothing',before.every(id=>afterB.some(n=>n.id===id)),`${before.filter(id=>afterB.some(n=>n.id===id)).length}/${before.length} earlier notes on the server`+(before.every(id=>afterB.some(n=>n.id===id))?'':' missing='+missingDetail(afterBSnapshot)));

 // 2. Live edits both ways, without reloading.
 await append(B,`${RUN} n1`,' edited on B');let ms=await waitFor(A,t=>t.some(x=>x.includes('edited on B')));
 check('an edit reaches the other device live',ms>=0,ms>=0?`${ms} ms`:'not received in 20 s');
 await add(A,`${RUN} n4`);ms=await waitFor(B,t=>t.some(x=>x.startsWith(`${RUN} n4`)));
 check('a new note reaches the other device live',ms>=0,ms>=0?`${ms} ms`:'not received in 20 s');

 // 3. Offline edit, then reconnect.
 await online(B,false);await append(B,`${RUN} n2`,' offline');await sleep(1000);
 check('offline edits show as pending, never as synced',/sync pending/i.test(await status(B)));
 await online(B,true);ms=await waitFor(A,t=>t.some(x=>x.includes(' offline')),30000);
 check('an offline edit syncs after reconnecting',ms>=0,ms>=0?`${ms} ms after reconnecting`:'not received in 30 s');

 // 4. Both devices offline edit the same bullet; both edits survive and the devices agree.
 await online(A,false);await online(B,false);
 await append(A,`${RUN} n3`,' [A]');await append(B,`${RUN} n3`,' [B]');
 await online(A,true);await online(B,true);
 const both=t=>t.some(x=>x.startsWith(`${RUN} n3`)&&x.includes('[A]')&&x.includes('[B]'));
 await waitFor(A,both,30000);await waitFor(B,both,30000);
 const a3=(await texts(A)).find(x=>x.startsWith(`${RUN} n3`)),b3=(await texts(B)).find(x=>x.startsWith(`${RUN} n3`));
 check('concurrent edits to one bullet keep both and converge',!!a3&&a3===b3&&a3.includes('[A]')&&a3.includes('[B]'),JSON.stringify([a3,b3]));

 // 5. A third brand-new device sees the same outline after everything above.
 await synced(A,30000).catch(()=>{});await synced(B,30000).catch(()=>{});
 const C=await device(browser,'C'),c=(await texts(C)).filter(t=>t.startsWith(RUN)).sort(),b=(await texts(B)).filter(t=>t.startsWith(RUN)).sort();
 check('a third new device sees the same notes',c.length===4&&JSON.stringify(c)===JSON.stringify(b),`${c.length}/4`);

 // Task planning is gated to the new staging frontend. Reuse this run's own n4
 // rather than creating an Inbox/system root or touching anyone else's notes.
 if(process.env.E2E_TASK_PLANNING==='true'){
  const base=await server(),task=base.doc.tables.bullets.find(n=>n.text===`${RUN} n4`);
  if(!task)throw Error('Missing this run\'s task fixture.');
  const next={...base.doc,tables:{...base.doc.tables,bullets:base.doc.tables.bullets.map(n=>n.id===task.id?{...n,taskState:'TODO'}:n)}};
  const {updates}=applyDocument(base.states,base.doc,next,{clientID:Math.floor(Math.random()*2**31)});
  const response=await fetch(`${API}/sync/v3`,{method:'POST',headers:{Authorization:token,Origin:APP,'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),updates,since:base.revision})});
  if(!response.ok)throw Error('Task fixture was refused: '+response.status);
  const openTasks=async d=>{await d.page.locator('.sidebar-nav').getByRole('button',{name:'Tasks',exact:true}).click();await d.page.getByRole('button',{name:'Search tasks'}).click();await d.page.getByLabel('Find tasks',{exact:true}).fill(RUN);};
  const taskView=async(d,label)=>d.page.getByRole('navigation',{name:'Task views'}).getByRole('button',{name:new RegExp('^'+label+'\\b')}).click();
  await openTasks(A);await taskView(A,'Anytime');
  const ar=A.page.locator(`[data-task-id="${task.id}"]`);await ar.getByRole('button',{name:'Plan',exact:true}).click();
  const date=await A.page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');});
  await online(A,false);await A.page.getByLabel('Task scheduled date',{exact:true}).fill(date);await A.page.getByLabel('Task priority',{exact:true}).selectOption('3');await A.page.getByText('More: effort estimate',{exact:true}).click();await A.page.getByLabel('Task estimated minutes',{exact:true}).fill('25');await A.page.getByRole('button',{name:'Save task details',exact:true}).click();await sleep(800);
  check('offline task planning remains pending',/sync pending/i.test(await status(A)));
  await online(A,true);await synced(A,30000);await openTasks(B);
  const br=B.page.locator(`[data-task-id="${task.id}"]`);await br.getByText('~25 min',{exact:true}).waitFor();await br.getByRole('button',{name:'Plan',exact:true}).click();const otherDate=await B.page.getByLabel('Task scheduled date',{exact:true}).inputValue();await B.page.keyboard.press('Escape');
  check('task planning reaches the other device without copies',await br.count()===1&&otherDate===date);
  await br.getByRole('checkbox',{name:'Complete task '+task.text,exact:true}).click();await taskView(A,'Completed');await ar.waitFor();await synced(B,30000);
  const saved=(await server()).doc.tables.bullets.filter(n=>n.id===task.id);
  check('task completion and planning converge on the original',saved.length===1&&saved[0].taskState==='DONE'&&saved[0].scheduledDate===date&&saved[0].taskPriority===3&&saved[0].taskDurationMinutes===25);
  for(const d of [A,B])await d.page.locator('.sidebar-nav').getByRole('button',{name:/^Notes/}).click();
 }

 // 6. A device-only workspace never sends anything: its note text must not appear in any request,
 // and the main workspace must not show it. The workspace is deleted afterwards.
 if(await C.page.$('.workspace-current')){
  const secret=`${RUN} device-only ${Math.random().toString(36).slice(2,8)}`,leaks=[];let open=false,calls=0;
  C.page.on('request',r=>{if(((r.url()+(r.postData()||''))).includes(secret))leaks.push(r.url());if(open&&r.url().startsWith(API))calls++;});
  const reload=action=>Promise.all([C.page.waitForNavigation({waitUntil:'load'}).catch(()=>{}),action()]);
  await C.page.click('.workspace-current');await C.page.getByText('New device-only workspace').click();await C.page.fill('[aria-label="Workspace name"]','E2E device-only');
  await reload(()=>C.page.getByRole('button',{name:'Create and open'}).click());open=true;await C.page.waitForSelector('[aria-label="Add bullet"]',{timeout:30000});
  await add(C,secret);await sleep(2500);
  check('a device-only workspace makes no sync requests and sends nothing',!leaks.length&&!calls,`${calls} sync requests, ${leaks.length} leaks`);
  await C.page.click('.workspace-current');await C.page.getByText(/Delete “E2E device-only”/).click();await C.page.fill('[aria-label="Type the workspace name to confirm"]','E2E device-only');
  await reload(()=>C.page.getByRole('button',{name:'Delete permanently'}).click());open=false;await synced(C,60000);
  await search(C,secret);check('the main workspace never shows device-only notes',!(await rows(C)).some(t=>t.includes(secret))&&!(await server()).doc.tables.bullets.some(n=>n.text.includes(secret)));
 }
 const errors=[A,B,C].flatMap(d=>d.errors.map(e=>`${d.name}: ${e}`));
 check('no app errors on any device',!errors.length,errors.slice(0,3).join(' | '));
}catch(e){check('check completed',false,String(e?.message||e).slice(0,300));try{for(const pg of browser.contexts().flatMap(c=>c.pages()))await pg.screenshot({path:`e2e-failure-${browser.contexts().indexOf(pg.context())}.png`});}catch{}}
finally{
 try{
  if(token){const removed=await cleanup();const after=(await server()).doc.tables.bullets.filter(n=>!n.text.startsWith(MARK)||before?.includes(n.id)).map(n=>n.id).sort();
   console.log(`cleanup removed ${removed} test bullets`);
   if(before)check('the account holds exactly its earlier notes afterwards',JSON.stringify(after)===JSON.stringify(before),`${after.length} of ${before.length} notes`);}
 }catch(e){check('cleanup',false,String(e?.message||e).slice(0,200));}
 await browser.close();
}
const failed=results.filter(r=>!r.ok);
console.log(failed.length?`\n${failed.length} of ${results.length} checks FAILED`:`\nAll ${results.length} checks passed`);
process.exit(failed.length?1:0);
