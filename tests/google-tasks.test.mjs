import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {googleTasksRoute as handle,googleTasksPublic as publicRoute,seal,unseal,verifyGoogleIdentity,cleanupGoogleTasks} from '../cloud/google-tasks.mjs';
import {route,readLimited} from '../cloud/worker.mjs';
const base='https://sync.example/integrations/google-tasks',origin='https://staging.remonook.com';
function setup(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../cloud/schema.sql',import.meta.url),'utf8'));const DB={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async run(){return sqlite.prepare(sql).run(...params);}};}};return {sqlite,DB,ALLOWED_ORIGINS:origin,GOOGLE_TASKS_CLIENT_ID:'client',GOOGLE_TASKS_CLIENT_SECRET:'secret',GOOGLE_TASKS_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),GOOGLE_TASKS_REDIRECT_URI:base+'/callback'};}
const request=(path,body,extra={})=>new Request(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
const identity=async()=>({subject:'google-alice',email:'alice@example.test'});
const tokenResponse=()=>Response.json({access_token:'google-access-private',refresh_token:'google-refresh-private',id_token:'signed-google-identity',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/tasks'});
async function authorize(env,uid='alice'){
 const started=await (await handle(request('/connect',{}),env,uid,{readLimited})).json();assert.ok(started.state);
 const redirect=await publicRoute(new Request(started.url),env);assert.equal(redirect.status,302);
 const authURL=new URL(redirect.headers.get('Location'));assert.equal(authURL.searchParams.get('code_challenge_method'),'S256');assert.ok(authURL.searchParams.get('nonce'));
 const cookie=redirect.headers.get('Set-Cookie').split(';')[0];
 return {...started,cookie,authURL};
}
async function callback(env,start,options={}){
 const result=await publicRoute(request('/callback?state='+start.state+'&code=code',undefined,{Cookie:start.cookie}),env,{fetcher:async(url,init)=>{assert.equal(init.redirect,'manual','Workers supports manual redirect handling');return tokenResponse();},identity,...options});
 const html=await result.text();const payload=/postMessage\((\{.*?\}),/.exec(html);return {result,html,data:payload?JSON.parse(payload[1]):null};
}
async function connect(env,uid='alice'){
 const start=await authorize(env,uid),done=await callback(env,start);assert.ok(done.data.completion);
 const result=await handle(request('/finish',{state:start.state,completion:done.data.completion}),env,uid,{readLimited});assert.equal(result.status,200);return result.json();
}
test('Google identity verification checks issuer, audience, nonce and verified email',async()=>{
 const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey);jwk.kid='google-test';const resolver=createLocalJWKSet({keys:[jwk]});
 const sign=(changes={})=>new SignJWT({email:'alice@test.example',email_verified:true,nonce:'nonce',...changes}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject('google-alice').setIssuer('https://accounts.google.com').setAudience('client').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
 assert.equal((await verifyGoogleIdentity(await sign(),{GOOGLE_TASKS_CLIENT_ID:'client'},'nonce',resolver)).subject,'google-alice');
 const wrongAudience=await sign();await assert.rejects(()=>verifyGoogleIdentity(wrongAudience,{GOOGLE_TASKS_CLIENT_ID:'wrong'},'nonce',resolver));
 const wrongNonce=await sign({nonce:'wrong'});await assert.rejects(()=>verifyGoogleIdentity(wrongNonce,{GOOGLE_TASKS_CLIENT_ID:'client'},'nonce',resolver));
 const unverified=await sign({email_verified:false});await assert.rejects(()=>verifyGoogleIdentity(unverified,{GOOGLE_TASKS_CLIENT_ID:'client'},'nonce',resolver));
});
test('OAuth is single-use, browser-bound, UID-bound, encrypted and separate from workspace records',async()=>{
 const env=setup();try{
 const a=await authorize(env);
 let r=await publicRoute(request('/callback?state='+a.state+'&code=code'),env,{fetcher:async()=>tokenResponse(),identity});assert.equal(r.status,400,'missing browser cookie cannot authorize');
 const done=await callback(env,a);assert.ok(done.data.completion);assert.match(done.result.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.doesNotMatch(done.html,/google-refresh-private|google-access-private/);
 r=await handle(request('/finish',{state:a.state,completion:done.data.completion}),env,'bob',{readLimited});assert.equal(r.status,409);
 r=await handle(request('/finish',{state:a.state,completion:done.data.completion}),env,'alice',{readLimited});assert.equal(r.status,200);const status=await r.json();assert.equal(status.email,'alice@example.test');
 assert.equal((await handle(request('/finish',{state:a.state,completion:done.data.completion}),env,'alice',{readLimited})).status,409);
 assert.equal((await publicRoute(request('/callback?state='+a.state+'&code=code',undefined,{Cookie:a.cookie}),env)).status,400);
 const row=env.sqlite.prepare('SELECT * FROM google_tasks_connections WHERE uid=?').get('alice');assert.ok(!row.credentials.includes('private'));assert.equal((await unseal(env,'alice',row.version,row.credentials)).refresh_token,'google-refresh-private');
 await assert.rejects(()=>unseal(env,'bob',row.version,row.credentials));assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,0);
 assert.equal((await(await handle(request('/status'),env,'bob')).json()).connected,false);
 assert.equal((await handle(request('/lists?connection='+status.connection),env,'bob',{readLimited})).status,401);
 await assert.rejects(()=>route(request('/status'),env),e=>e.status===401);
 }finally{env.sqlite.close();}
});
test('cancelled, expired and replayed OAuth preserve the previous connection; disconnect prevents resurrection',async()=>{
 const env=setup();try{
 const connected=await connect(env),start=await authorize(env);
 const denied=await publicRoute(request('/callback?state='+start.state+'&error=access_denied',undefined,{Cookie:start.cookie}),env);assert.equal(denied.status,200);assert.equal((await(await handle(request('/status'),env,'alice')).json()).connection,connected.connection);
 assert.equal((await publicRoute(new Request(start.url),env)).status,400);
 const pending=await authorize(env);env.sqlite.prepare('UPDATE google_tasks_oauth SET expires_at=0').run();assert.equal((await callback(env,pending)).result.status,400);
 const pending2=await authorize(env),done=await callback(env,pending2);
 const disconnected=await handle(request('/disconnect',{connection:connected.connection}),env,'alice',{readLimited,fetcher:async()=>new Response('',{status:500})});assert.equal((await disconnected.json()).revoked,false);
 assert.equal((await handle(request('/finish',{state:pending2.state,completion:done.data.completion}),env,'alice',{readLimited})).status,409);
 const row=env.sqlite.prepare('SELECT * FROM google_tasks_connections').get();assert.equal(row.status,'disconnected');assert.equal(row.credentials,null);
 }finally{env.sqlite.close();}
});
test('Tasks proxy handles pages, date-only creation, completion, receipts and quota errors',async()=>{
 const env=setup();try{
 const c=await connect(env);let creates=0;
 const fetcher=async(url,options)=>{
  assert.equal(options.redirect,'manual','authenticated requests must never follow redirects');
  assert.equal(options.headers.Authorization,'Bearer google-access-private');
  if(options.method==='POST'){creates++;const body=JSON.parse(options.body);assert.equal(body.due,'2026-11-04T00:00:00.000Z');return Response.json({id:'created',title:body.title,status:'needsAction',due:body.due});}
  if(options.method==='PATCH'){assert.deepEqual(JSON.parse(options.body),{status:'needsAction',completed:null});return Response.json({id:'task',title:'Task',status:'needsAction'});}
  assert.equal(url.searchParams.get('pageToken'),'next');if(url.pathname.endsWith('/tasks')){assert.equal(url.searchParams.get('showHidden'),'true');assert.equal(url.searchParams.get('showAssigned'),'true');}
  return Response.json({items:[{id:'task',title:'Task',status:'completed',due:'2026-11-04T00:00:00Z'}],nextPageToken:'page-2'});
 };
 const options={readLimited,fetcher};
 let r=await handle(request('/tasks?connection='+c.connection+'&list=list&pageToken=next'),env,'alice',options);let data=await r.json();assert.equal(data.items[0].due,'2026-11-04');assert.equal(data.nextPageToken,'page-2');
 const body={connection:c.connection,list:'list',title:' New task ',due:'2026-11-04',operation:'operation-123456789'};
 for(let i=0;i<2;i++){r=await handle(request('/create',body),env,'alice',options);assert.equal(r.status,200);}assert.equal(creates,1);
 assert.doesNotMatch(env.sqlite.prepare('SELECT result FROM google_tasks_operations').get().result,/New task/);
 assert.equal((await handle(request('/create',{...body,title:'Different'}),env,'alice',options)).status,409);
 assert.equal((await handle(request('/complete',{connection:c.connection,list:'list',task:'task',completed:false}),env,'alice',options)).status,200);
 assert.equal((await handle(request('/tasks?connection='+c.connection+'&list=list'),env,'alice',{readLimited,fetcher:async()=>new Response('',{status:429})})).status,429);
 assert.equal((await handle(request('/tasks?connection=stale&list=list'),env,'alice',options)).status,409);
 }finally{env.sqlite.close();}
});
test('ambiguous creation is not replayed and refresh-token revocation requests reconnection',async()=>{
 const env=setup();try{
 const c=await connect(env),body={connection:c.connection,list:'list',title:'Task',operation:'operation-ambiguous'};let attempts=0;
 const options={readLimited,fetcher:async()=>{attempts++;throw Error('timeout');}};
 assert.equal((await(await handle(request('/create',body),env,'alice',options)).json()).code,'ambiguous');
 assert.equal((await handle(request('/create',body),env,'alice',options)).status,409);assert.equal(attempts,1);
 const row=env.sqlite.prepare('SELECT * FROM google_tasks_connections').get(),value=await unseal(env,'alice',row.version,row.credentials);value.expiresAt=0;
 env.sqlite.prepare('UPDATE google_tasks_connections SET credentials=?').run(await seal(env,'alice',row.version,value));
 const r=await handle(request('/lists?connection='+c.connection),env,'alice',{readLimited,fetcher:async()=>Response.json({error:'invalid_grant'},{status:400})});assert.equal((await r.json()).code,'reconnect');
 assert.equal((await(await handle(request('/status'),env,'alice')).json()).reconnect,true);
 }finally{env.sqlite.close();}
});
test('expired access tokens renew automatically, and disconnect rejects in-flight results',async()=>{
 const env=setup();try{
 const c=await connect(env);let calls=0,refreshes=0;
 const fetcher=async(url)=>{if(String(url).includes('oauth2.googleapis.com/token')){refreshes++;return Response.json({access_token:'renewed',expires_in:3600});}calls++;return calls===1?Response.json({error:{}},{status:401}):Response.json({items:[]});};
 const r=await handle(request('/lists?connection='+c.connection),env,'alice',{readLimited,fetcher});assert.equal(r.status,200);assert.equal(refreshes,1);assert.equal(calls,2);
 let release,started;const signal=new Promise(r=>{started=r;});
 const slow=handle(request('/lists?connection='+c.connection),env,'alice',{readLimited,fetcher:async()=>{started();return new Promise(r=>{release=r;});}});await signal;
 await handle(request('/disconnect',{connection:c.connection}),env,'alice',{readLimited,fetcher:async()=>new Response('')});
 release(Response.json({items:[{id:'private',title:'Do not deliver after disconnect'}]}));const stale=await slow;assert.equal(stale.status,409);assert.doesNotMatch(await stale.text(),/Do not deliver/);
 }finally{env.sqlite.close();}
});
test('OAuth rejects mismatched origins; create validates dates and preserves receipts for server failures',async()=>{
 const env=setup();try{
 const denied=await handle(new Request(base+'/connect',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),env,'alice',{readLimited});assert.equal(denied.status,403);
 const c=await connect(env),options={readLimited,fetcher:async()=>Response.json({error:{}},{status:503})},body={connection:c.connection,list:'list',title:'Task',operation:'server-error-operation'};
 assert.equal((await handle(request('/create',{...body,due:'2026-02-31'}),env,'alice',options)).status,400);
 assert.equal((await handle(request('/create',{...body,due:'2026-13-01'}),env,'alice',options)).status,400);
 assert.equal((await(await handle(request('/create',body),env,'alice',options)).json()).code,'ambiguous');
 assert.equal((await handle(request('/create',body),env,'alice',options)).status,409);
 }finally{env.sqlite.close();}
});

test('scheduled cleanup removes expired handoffs and old receipts without changing notes',async()=>{
 const env=setup();try{
  const now=Date.now();env.sqlite.prepare("INSERT INTO workspaces VALUES('alice',1,'notes',?)").run(now);
  for(const [state,expires]of [['expired',now-1],['active',now+60000]])env.sqlite.prepare("INSERT INTO google_tasks_oauth(state,uid,base_version,origin,verifier,nonce,expires_at) VALUES(?,'alice','v1','origin','encrypted','nonce',?)").run(state,expires);
  for(const [operation,created]of [['old',now-8*86400000],['recent',now]])env.sqlite.prepare("INSERT INTO google_tasks_operations(uid,connection,operation,request_hash,created_at) VALUES('alice','v1',?,'hash',?)").run(operation,created);
  await cleanupGoogleTasks(env,now);assert.equal(env.sqlite.prepare('SELECT state FROM google_tasks_oauth').get().state,'active');assert.equal(env.sqlite.prepare('SELECT operation FROM google_tasks_operations').get().operation,'recent');assert.equal(env.sqlite.prepare('SELECT body FROM workspaces').get().body,'notes');
 }finally{env.sqlite.close();}
});

test('an unreadable successful create response is ambiguous and is never replayed',async()=>{
 const env=setup();try{
  const c=await connect(env);let attempts=0;const options={readLimited,fetcher:async()=>{attempts++;return new Response('not json',{status:200});}},body={connection:c.connection,list:'list',title:'Task',operation:'invalid-json-operation'};
  assert.equal((await(await handle(request('/create',body),env,'alice',options)).json()).code,'ambiguous');assert.equal((await handle(request('/create',body),env,'alice',options)).status,409);assert.equal(attempts,1);
 }finally{env.sqlite.close();}
});

test('OAuth and task proxy reject redirects without forwarding credentials',async()=>{
 const env=setup();try{
  const start=await authorize(env);let tokenCalls=0;
  const done=await callback(env,start,{fetcher:async(url,init)=>{tokenCalls++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example/token'}});}});
  assert.equal(tokenCalls,1);assert.equal(done.data.completion,'');
  const c=await connect(env);let taskCalls=0;
  const r=await handle(request('/lists?connection='+c.connection),env,'alice',{readLimited,fetcher:async(url,init)=>{taskCalls++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example/tasks'}});}});
  assert.equal(taskCalls,1);assert.equal(r.status,502);
 }finally{env.sqlite.close();}
});
