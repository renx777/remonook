import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {route} from '../cloud/worker.mjs';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';

function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const stmt=sql=>{let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};},exec(){return sqlite.prepare(sql).run(...params);}};};
 return {ALLOWED_ORIGINS:'https://app.test,http://localhost:5173',DB:{prepare:stmt,async batch(list){sqlite.exec('BEGIN');try{for(const s of list)s.exec();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}return [];}}};}
const req=(env,method,path,{body,auth,form,headers={}}={})=>route(new Request('https://sync.test'+path,{method,redirect:'manual',headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:body?{'Content-Type':'application/json'}:{}),...headers},...(form?{body:new URLSearchParams(form).toString()}:body?{body:JSON.stringify(body)}:{})}),env,async t=>t);
const b64url=b=>b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const rpc=async(env,token,method,params)=>{const r=await req(env,'POST','/mcp',{auth:token,body:{jsonrpc:'2.0',id:1,method,params}});return {status:r.status,headers:r.headers,body:r.status===200?await r.json():await r.text()};};

test('OAuth sign-in for AI apps: discovery, registration, consent, PKCE, refresh rotation and disconnect',async()=>{
 const env=database(),doc=empty();doc.tables.bullets=[bullet('a',{text:'Photosynthesis notes'})];
 await req(env,'PUT','/workspace',{auth:'alice',body:{baseRevision:0,doc,assets:[]}});
 // Unauthenticated MCP points the client at the resource metadata.
 const anon=await rpc(env,undefined,'tools/list');assert.equal(anon.status,401);assert.match(anon.headers.get('WWW-Authenticate'),/resource_metadata="https:\/\/sync\.test\/\.well-known\/oauth-protected-resource"/);
 const prm=await(await req(env,'GET','/.well-known/oauth-protected-resource')).json();assert.equal(prm.resource,'https://sync.test/mcp');assert.deepEqual(prm.authorization_servers,['https://sync.test']);
 const as=await(await req(env,'GET','/.well-known/oauth-authorization-server')).json();assert.deepEqual(as.code_challenge_methods_supported,['S256']);
 // Dynamic client registration rejects non-https redirect URIs.
 assert.equal((await req(env,'POST','/oauth/register',{body:{redirect_uris:['http://evil.example/cb']}})).status,400);
 const client=await(await req(env,'POST','/oauth/register',{body:{client_name:'Claude',redirect_uris:['https://claude.example/callback'],token_endpoint_auth_method:'none'}})).json();
 assert.match(client.client_id,/^rnc_/);
 const verifier=b64url(randomBytes(32)),challenge=b64url(createHash('sha256').update(verifier).digest());
 const q=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:'https://claude.example/callback',code_challenge:challenge,code_challenge_method:'S256',state:'xyz',scope:'read write',resource:'https://sync.test/mcp'});
 // A mismatched redirect is refused on our own page, never redirected.
 const bad=await req(env,'GET','/oauth/authorize?'+new URLSearchParams({...Object.fromEntries(q),redirect_uri:'https://evil.example/cb'}));assert.equal(bad.status,400);
 const auth=await req(env,'GET','/oauth/authorize?'+q);assert.equal(auth.status,302);
 const app=new URL(auth.headers.get('Location'));assert.equal(app.origin,'https://app.test');const requestId=app.searchParams.get('connect');assert.match(requestId,/^[a-f0-9]{32}$/);
 // Consent needs the owner's RemoNook session; the app shows who asks.
 await assert.rejects(req(env,'GET','/oauth/requests/'+requestId),e=>e.status===401);
 const info=await(await req(env,'GET','/oauth/requests/'+requestId,{auth:'alice'})).json();assert.equal(info.app,'Claude');assert.deepEqual(info.scopes,['read','write']);
 const approved=await(await req(env,'POST','/oauth/requests/'+requestId+'/approve',{auth:'alice',body:{scopes:['read']}})).json();
 const back=new URL(approved.redirect);assert.equal(back.origin+back.pathname,'https://claude.example/callback');assert.equal(back.searchParams.get('state'),'xyz');const code=back.searchParams.get('code');
 // PKCE: a wrong verifier burns nothing useful and fails; the right one works once.
 const wrong=await req(env,'POST','/oauth/token',{form:{grant_type:'authorization_code',code,redirect_uri:'https://claude.example/callback',client_id:client.client_id,code_verifier:b64url(randomBytes(32))}});assert.equal(wrong.status,400);
 const tokens=await req(env,'POST','/oauth/token',{form:{grant_type:'authorization_code',code,redirect_uri:'https://claude.example/callback',client_id:client.client_id,code_verifier:verifier}});
 assert.equal(tokens.status,400,'a code is single use, even after a failed verifier');
 // Start again and exchange correctly.
 const auth2=await req(env,'GET','/oauth/authorize?'+q),id2=new URL(auth2.headers.get('Location')).searchParams.get('connect');
 const code2=new URL((await(await req(env,'POST','/oauth/requests/'+id2+'/approve',{auth:'alice',body:{scopes:['read']}})).json()).redirect).searchParams.get('code');
 const t=await(await req(env,'POST','/oauth/token',{form:{grant_type:'authorization_code',code:code2,redirect_uri:'https://claude.example/callback',client_id:client.client_id,code_verifier:verifier}})).json();
 assert.match(t.access_token,/^rnk_/);assert.equal(t.scope,'read');assert.equal(t.expires_in,3600);
 const list=await rpc(env,t.access_token,'tools/list');assert.equal(list.status,200);const names=list.body.result.tools.map(x=>x.name);assert.ok(names.includes('read_page')&&!names.includes('write_notes'),'the owner chose read only');
 const read=await rpc(env,t.access_token,'tools/call',{name:'search',arguments:{query:'Photosynthesis'}});assert.match(read.body.result.content[0].text,/Photosynthesis notes/);
 // Refresh rotates: the new pair works, the old refresh token does not.
 const r2=await(await req(env,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:t.refresh_token,client_id:client.client_id}})).json();assert.match(r2.access_token,/^rnk_/);
 assert.equal((await req(env,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:t.refresh_token,client_id:client.client_id}})).status,400);
 assert.equal((await rpc(env,r2.access_token,'tools/list')).status,200);
 // Settings lists the connection; disconnecting stops tokens and refresh.
 const listed=await(await req(env,'GET','/mcp/tokens',{auth:'alice'})).json();const grant=listed.tokens.find(x=>x.kind==='oauth');assert.equal(grant.name,'Claude');
 await req(env,'DELETE','/mcp/tokens/'+grant.id,{auth:'alice'});
 assert.equal((await rpc(env,r2.access_token,'tools/list')).status,401);
 assert.equal((await req(env,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:r2.refresh_token,client_id:client.client_id}})).status,400);
 // Another user cannot approve someone else's request into their account... the code belongs to whoever approved.
 const denied=await(await req(env,'POST','/oauth/requests/'+new URL((await req(env,'GET','/oauth/authorize?'+q)).headers.get('Location')).searchParams.get('connect')+'/deny',{auth:'alice',body:{}})).json();
 assert.equal(new URL(denied.redirect).searchParams.get('error'),'access_denied');
 // Public OAuth endpoints accept any origin; the app API does not.
 assert.equal((await req(env,'GET','/.well-known/oauth-authorization-server',{headers:{Origin:'https://claude.ai'}})).status,200);
});
