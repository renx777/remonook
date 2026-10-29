import {createRemoteJWKSet,jwtVerify} from 'jose';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const PREFIX='/integrations/google-tasks',SCOPE='https://www.googleapis.com/auth/tasks',COOKIE='__Host-remo-tasks';
const fail=(message,status=400,code='')=>{throw Object.assign(Error(message),{status,code});};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export const hash=async text=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
export async function seal(env,uid,version,value){
 const key=await crypto.subtle.importKey('raw',unb64(env.GOOGLE_TASKS_ENCRYPTION_KEY),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(uid+':'+version)},key,new TextEncoder().encode(JSON.stringify(value)));
 return b64(iv)+'.'+b64(new Uint8Array(cipher));
}
export async function unseal(env,uid,version,value){
 const [iv,cipher]=value.split('.'),key=await crypto.subtle.importKey('raw',unb64(env.GOOGLE_TASKS_ENCRYPTION_KEY),'AES-GCM',false,['decrypt']);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(uid+':'+version)},key,unb64(cipher))));
}
export const googleTasksConfigured=env=>Boolean(env.GOOGLE_TASKS_CLIENT_ID&&env.GOOGLE_TASKS_CLIENT_SECRET&&env.GOOGLE_TASKS_ENCRYPTION_KEY&&env.GOOGLE_TASKS_REDIRECT_URI);
const configured=googleTasksConfigured;
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)return {};
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();fail('Google returned too much data.',502);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Google returned an invalid response.',502);}
}
async function form(fetcher,url,body){return fetcher(url,{method:'POST',body:new URLSearchParams(body),signal:AbortSignal.timeout(15000),redirect:'error'});}
const rowFor=(env,uid)=>env.DB.prepare('SELECT * FROM google_tasks_connections WHERE uid=?').bind(uid).first();
async function assertVersion(env,uid,version){const current=await rowFor(env,uid);if(!current||current.version!==version||current.status==='disconnected')fail('The Google Tasks connection changed. Refresh to continue.',409,'connection_changed');}
async function credentials(env,uid,row,fetcher,force=false){
 if(!row||row.status!=='connected')fail('Reconnect Google Tasks to continue.',401,'reconnect');
 const value=await unseal(env,uid,row.version,row.credentials);
 if(!force&&value.expiresAt>Date.now()+60000)return value;
 const response=await form(fetcher,'https://oauth2.googleapis.com/token',{client_id:env.GOOGLE_TASKS_CLIENT_ID,client_secret:env.GOOGLE_TASKS_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:value.refresh_token});
 const data=await boundedJson(response);
 if(!response.ok){if(data.error==='invalid_grant'){await env.DB.prepare("UPDATE google_tasks_connections SET status='reconnect' WHERE uid=? AND version=? AND credentials=?").bind(uid,row.version,row.credentials).run();fail('Google access has expired or was revoked. Reconnect to continue.',401,'reconnect');}fail('Google authorization is temporarily unavailable. Try again later.',503);}
 if(typeof data.access_token!=='string')fail('Google authorization is temporarily unavailable.',502);
 const next={...value,access_token:data.access_token,refresh_token:data.refresh_token||value.refresh_token,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};
 const encrypted=await seal(env,uid,row.version,next);
 // Compare ciphertext as well as version so concurrent refreshes cannot overwrite a newer token.
 await env.DB.prepare("UPDATE google_tasks_connections SET credentials=?,status='connected' WHERE uid=? AND version=? AND credentials=?").bind(encrypted,uid,row.version,row.credentials).run();
 await assertVersion(env,uid,row.version);return next;
}
export async function verifyGoogleIdentity(token,env,nonce,keyResolver=googleKeys){
 const {payload}=await jwtVerify(token,keyResolver,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_TASKS_CLIENT_ID,requiredClaims:['sub','email','exp','iat','nonce']});
 if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.email!=='string')fail('Google identity could not be verified.',401);
 return {subject:payload.sub,email:payload.email};
}
function callbackPage(origin,state,completion,message){
 const nonce=random(),payload=JSON.stringify({type:'remo-google-tasks',state,completion,message}).replaceAll('<','\\u003c');
 const script=`if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(origin)});window.close();}`;
 return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Google Tasks · RemoNook</title><p>${completion?'Google Tasks authorized. Return to RemoNook to finish connecting.':'Google Tasks was not connected. Return to RemoNook and try again.'}</p><script nonce="${nonce}">${script}</script>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,'Set-Cookie':`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`}});
}
// Only these two routes are public. Neither can activate a connection: completion
// additionally requires the original Firebase identity and a one-use popup proof.
export async function googleTasksPublic(request,env,{fetcher=fetch,identity=verifyGoogleIdentity}={}){
 const url=new URL(request.url);if(![PREFIX+'/authorize',PREFIX+'/callback'].includes(url.pathname))return null;
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);
 if(!configured(env))return json({error:'Google Tasks is awaiting configuration.'},503);
 const state=url.searchParams.get('state')||'';if(!/^[\w-]{43}$/.test(state))return json({error:'Invalid authorization state.'},400);
 const key=await hash(state),now=Date.now();
 if(url.pathname.endsWith('/authorize')){
  const browser=random(),row=await env.DB.prepare('UPDATE google_tasks_oauth SET browser_hash=? WHERE state=? AND browser_hash IS NULL AND expires_at>? RETURNING *').bind(await hash(browser),key,now).first();
  if(!row)return json({error:'This connection request expired. Start again in RemoNook.'},400);
  const verifier=await unseal(env,row.uid,key,row.verifier),target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v]of Object.entries({client_id:env.GOOGLE_TASKS_CLIENT_ID,redirect_uri:env.GOOGLE_TASKS_REDIRECT_URI,response_type:'code',scope:'openid email '+SCOPE,access_type:'offline',prompt:'consent select_account',state,nonce:row.nonce,code_challenge:await hash(verifier),code_challenge_method:'S256'}))target.searchParams.set(k,v);
  return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':`${COOKIE}=${browser}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`}});
 }
 const browser=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const row=await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE state=? AND browser_hash=? AND expires_at>? AND completion_hash IS NULL RETURNING *').bind(key,await hash(browser),now).first();
 if(!row)return json({error:'Authorization expired or was already used. Start again in RemoNook.'},400);
 try{
  if(url.searchParams.has('error'))return callbackPage(row.origin,state,'','Google authorization was cancelled.');
  const code=url.searchParams.get('code');if(!code||code.length>4096)fail('Google did not return an authorization code.');
  const verifier=await unseal(env,row.uid,key,row.verifier),response=await form(fetcher,'https://oauth2.googleapis.com/token',{client_id:env.GOOGLE_TASKS_CLIENT_ID,client_secret:env.GOOGLE_TASKS_CLIENT_SECRET,redirect_uri:env.GOOGLE_TASKS_REDIRECT_URI,grant_type:'authorization_code',code,code_verifier:verifier});
  const tokens=await boundedJson(response);
  if(!response.ok||typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||typeof tokens.id_token!=='string'||!String(tokens.scope||'').split(' ').includes(SCOPE))fail('Google did not grant the required access. Try connecting again.');
  const profile=await identity(tokens.id_token,env,row.nonce),completion=random();
  const value={...profile,access_token:tokens.access_token,refresh_token:tokens.refresh_token,expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000};
  await env.DB.prepare('INSERT INTO google_tasks_oauth(state,uid,base_version,origin,verifier,nonce,completion_hash,result,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(key,row.uid,row.base_version,row.origin,'',row.nonce,await hash(completion),await seal(env,row.uid,key,value),Date.now()+120000).run();
  return callbackPage(row.origin,state,completion,'');
 }catch{return callbackPage(row.origin,state,'','Google Tasks could not be connected. Try again.');}
}
const id=value=>{if(typeof value!=='string'||!value||value==='.'||value==='..'||value.length>1024)fail('Choose a valid Google task or list.');return encodeURIComponent(value);};
const pageToken=value=>{if(value&&value.length>4096)fail('Invalid page token.');return value||'';};
export async function googleTasksRoute(request,env,uid,{fetcher=fetch,readLimited}={}){
 const url=new URL(request.url),path=url.pathname.slice(PREFIX.length);let uncertainCreate=false;
 try{
  if(path==='/status'&&request.method==='GET'){
   if(!configured(env))return json({configured:false,connected:false});
   await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE uid=? AND expires_at<?').bind(uid,Date.now()).run();
   await env.DB.prepare('DELETE FROM google_tasks_operations WHERE uid=? AND created_at<?').bind(uid,Date.now()-7*86400000).run();
   const row=await rowFor(env,uid);return json({configured:true,connected:row?.status==='connected',reconnect:row?.status==='reconnect',connection:row&&row.status!=='disconnected'?row.version:'',email:row?.email||'',account:row?.subject||''});
  }
  if(!configured(env))fail('Google Tasks is awaiting configuration.',503,'not_configured');
  let body={};if(request.method==='POST'){try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,16384)));}catch(e){if(e.status)throw e;fail('Invalid request body.');}if(!body||typeof body!=='object'||Array.isArray(body))fail('Invalid request body.');}
  if(path==='/connect'&&request.method==='POST'){
   const origin=request.headers.get('Origin');if(!(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin))fail('Start the connection from RemoNook.',403);
   await env.DB.prepare("INSERT OR IGNORE INTO google_tasks_connections(uid,version,status,updated_at) VALUES(?,?,'disconnected',?)").bind(uid,crypto.randomUUID(),Date.now()).run();
   const current=await rowFor(env,uid),state=random(),key=await hash(state),verifier=random(),nonce=random();
   await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE uid=? OR expires_at<?').bind(uid,Date.now()).run();
   await env.DB.prepare('INSERT INTO google_tasks_oauth(state,uid,base_version,origin,verifier,nonce,expires_at) VALUES(?,?,?,?,?,?,?)').bind(key,uid,current.version,origin,await seal(env,uid,key,verifier),nonce,Date.now()+600000).run();
   return json({state,url:new URL(PREFIX+'/authorize?state='+state,env.GOOGLE_TASKS_REDIRECT_URI).href});
  }
  if(path==='/finish'&&request.method==='POST'){
   if(typeof body.state!=='string'||typeof body.completion!=='string')fail('Invalid connection completion.');
   const key=await hash(body.state),row=await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE state=? AND uid=? AND completion_hash=? AND expires_at>? RETURNING *').bind(key,uid,await hash(body.completion),Date.now()).first();
   if(!row)fail('This connection request expired. Start again.',409);
   const value=await unseal(env,uid,key,row.result),version=crypto.randomUUID(),cipher=await seal(env,uid,version,value);
   const saved=await env.DB.prepare("UPDATE google_tasks_connections SET version=?,status='connected',subject=?,email=?,credentials=?,updated_at=? WHERE uid=? AND version=? RETURNING version").bind(version,value.subject,value.email,cipher,Date.now(),uid,row.base_version).first();
   if(!saved)fail('The connection changed. Start again.',409,'connection_changed');
   return json({connected:true,connection:version,email:value.email});
  }
  const row=await rowFor(env,uid);
  if(path==='/disconnect'&&request.method==='POST'){
   if(body.connection!==row?.version)fail('The connection changed. Refresh first.',409,'connection_changed');
   // Tombstone first; concurrent refresh/callbacks cannot resurrect this version.
   const removed=await env.DB.prepare("UPDATE google_tasks_connections SET version=?,status='disconnected',subject=NULL,email=NULL,credentials=NULL,updated_at=? WHERE uid=? AND version=? RETURNING version").bind(crypto.randomUUID(),Date.now(),uid,row.version).first();if(!removed)fail('The connection changed. Refresh first.',409,'connection_changed');
   await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE uid=?').bind(uid).run();
   await env.DB.prepare('DELETE FROM google_tasks_operations WHERE uid=?').bind(uid).run();
   let revoked=true;if(row.credentials){try{const value=await unseal(env,uid,row.version,row.credentials);const r=await form(fetcher,'https://oauth2.googleapis.com/revoke',{token:value.refresh_token});revoked=r.ok;await r.body?.cancel();}catch{revoked=false;}}
   return json({connected:false,revoked});
  }
  if(!row||row.status!=='connected')fail('Reconnect Google Tasks to continue.',401,'reconnect');
  const connection=request.method==='GET'?url.searchParams.get('connection'):body.connection;
  if(connection!==row.version)fail('The Google Tasks connection changed. Refresh first.',409,'connection_changed');
  let target,method='GET',payload;
  if(path==='/lists'&&request.method==='GET'){
   target=new URL('https://tasks.googleapis.com/tasks/v1/users/@me/lists');target.searchParams.set('maxResults','100');target.searchParams.set('fields','nextPageToken,items(id,title)');target.searchParams.set('pageToken',pageToken(url.searchParams.get('pageToken')));
  }else if(path==='/tasks'&&request.method==='GET'){
   target=new URL('https://tasks.googleapis.com/tasks/v1/lists/'+id(url.searchParams.get('list'))+'/tasks');
   for(const [k,v]of Object.entries({fields:'nextPageToken,items(id,title,parent,position,status,due)',maxResults:'100',showCompleted:'true',showHidden:'true',showDeleted:'false',showAssigned:'true',pageToken:pageToken(url.searchParams.get('pageToken'))}))target.searchParams.set(k,v);
  }else if(path==='/create'&&request.method==='POST'){
   if(typeof body.title!=='string'||!body.title.trim()||body.title.length>1024)fail('Enter a task title of up to 1024 characters.');
   if(body.due){const date=new Date(body.due+'T00:00:00Z');if(typeof body.due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.due)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==body.due)fail('Choose a valid due date.');}
   target=new URL('https://tasks.googleapis.com/tasks/v1/lists/'+id(body.list)+'/tasks');method='POST';payload={title:body.title.trim(),...(body.due?{due:body.due+'T00:00:00.000Z'}:{})};
  }else if(path==='/complete'&&request.method==='POST'){
   if(typeof body.completed!=='boolean')fail('Choose a task status.');
   target=new URL('https://tasks.googleapis.com/tasks/v1/lists/'+id(body.list)+'/tasks/'+id(body.task));method='PATCH';payload={status:body.completed?'completed':'needsAction',...(!body.completed?{completed:null}:{})};
  }else fail('Not found.',404);
  let token=await credentials(env,uid,row,fetcher);
  let operation;
  if(method==='POST'){
   if(typeof body.operation!=='string'||!/^[\w-]{16,100}$/.test(body.operation))fail('Invalid task submission.');
   operation=body.operation;const signature=await hash(JSON.stringify({list:body.list,...payload}));
   const inserted=await env.DB.prepare('INSERT OR IGNORE INTO google_tasks_operations(uid,connection,operation,request_hash,created_at) VALUES(?,?,?,?,?) RETURNING operation').bind(uid,row.version,operation,signature,Date.now()).first();
   if(!inserted){const previous=await env.DB.prepare('SELECT * FROM google_tasks_operations WHERE uid=? AND connection=? AND operation=?').bind(uid,row.version,operation).first();if(previous.request_hash!==signature)fail('This submission has already been used.',409);if(previous.result)return json(JSON.parse(previous.result));fail('This task may already have been added. Refresh the list before trying again.',409,'ambiguous');}
  }
  let response;
  for(let attempt=0;attempt<2;attempt++){
   uncertainCreate=method==='POST';
   try{response=await fetcher(target,{method,headers:{Authorization:'Bearer '+token.access_token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{fail(method==='POST'?'This task may already have been added. Refresh the list before trying again.':'Google Tasks could not be reached. Try again.',503,method==='POST'?'ambiguous':'network');}
   if(response.status!==401||attempt)break;
   uncertainCreate=false;await response.body?.cancel();await assertVersion(env,uid,row.version);
   token=await credentials(env,uid,await rowFor(env,uid),fetcher,true);
  }
  await assertVersion(env,uid,row.version);
  if(!response.ok){if(response.status<500)uncertainCreate=false;let reason='';try{const errorBody=await boundedJson(response);reason=errorBody.error?.errors?.[0]?.reason||'';}catch{}if(operation&&response.status>=500)fail('This task may already have been added. Refresh the list before trying again.',503,'ambiguous');if(operation)await env.DB.prepare('DELETE FROM google_tasks_operations WHERE uid=? AND connection=? AND operation=?').bind(uid,row.version,operation).run();
   if(response.status===401){await env.DB.prepare("UPDATE google_tasks_connections SET status='reconnect' WHERE uid=? AND version=?").bind(uid,row.version).run();fail('Google access expired. Reconnect to continue.',401,'reconnect');}
   if(response.status===404)fail('This Google task or list is no longer available. Refresh your lists.',404,'not_found');
   if(response.status===429||['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(reason))fail('Google Tasks is busy. Wait a moment before trying again.',429,'rate_limit');
   fail('Google could not make this change. Check your access and try again.',response.status===403?403:502);
  }
  const data=await boundedJson(response);if(method==='POST'&&typeof data.id!=='string')fail('Task creation could not be confirmed.',503,'ambiguous');
  const cleanTask=t=>({id:t.id,title:String(t.title||''),parent:t.parent||'',position:t.position||'',status:t.status,due:t.due?.slice(0,10)||''});
  const result=method==='GET'?{connection:row.version,items:(data.items||[]).map(path==='/lists'?t=>({id:t.id,title:String(t.title||'Untitled list')}):cleanTask),nextPageToken:data.nextPageToken||''}:{connection:row.version,task:cleanTask(data)};
  if(operation)await env.DB.prepare('UPDATE google_tasks_operations SET result=? WHERE uid=? AND connection=? AND operation=?').bind(JSON.stringify({connection:row.version,task:{id:data.id}}),uid,row.version,operation).run();
  uncertainCreate=false;return json(result);
 }catch(error){if(uncertainCreate)return json({error:'This task may already have been added. Refresh the list before trying again.',code:'ambiguous'},503);if(error.status)return json({error:error.message,code:error.code||''},error.status);return json({error:'Google Tasks is temporarily unavailable. Try again later.'},503);}
}

export async function cleanupGoogleTasks(env,now=Date.now()){
 await env.DB.prepare('DELETE FROM google_tasks_oauth WHERE expires_at<?').bind(now).run();
 await env.DB.prepare('DELETE FROM google_tasks_operations WHERE created_at<?').bind(now-7*86400000).run();
}
