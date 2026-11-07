import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {route} from '../cloud/worker.mjs';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {openShared,project} from '../src/sync-crdt.mjs';

function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const stmt=sql=>{let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};},exec(){return sqlite.prepare(sql).run(...params);}};};
 return {DB:{prepare:stmt,async batch(list){sqlite.exec('BEGIN');try{for(const s of list)s.exec();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}return [];}}};}
const call=(env,method,path,body,auth='alice')=>route(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,async t=>t);
let rpcId=0;
const rpc=async(env,token,method,params)=>{const r=await call(env,'POST','/mcp',{jsonrpc:'2.0',...(method.startsWith('notifications/')?{}:{id:++rpcId}),method,params},token);return {status:r.status,body:r.status===202?null:await r.json()};};
const tool=async(env,token,name,args)=>{const r=await rpc(env,token,'tools/call',{name,arguments:args});return r.body.result;};
const serverDoc=async env=>{const r=await(await call(env,'GET','/sync/v2')).json();const y=openShared(r.update);try{return project(y).doc;}finally{y.destroy();}};
const withFiles=env=>{const objects=new Map();env.FILES={async put(k,v){objects.set(k,String(v));},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async delete(k){objects.delete(k);}};return objects;};
const line=(i,n)=>`- Note ${i}: `+'photosynthesis converts light energy into chemical energy '.repeat(n);

test('large workspaces: state and notes move to R2 with a D1 pointer, old copies are deleted and devices still sync',async()=>{
 const env=database(),objects=withFiles(env),doc=empty();doc.tables.bullets=[bullet('a',{text:'Start'})];
 await call(env,'PUT','/workspace',{baseRevision:0,doc,assets:[]});
 const t=(await(await call(env,'POST','/mcp/tokens',{name:'Test',scopes:['read','write']})).json()).token;
 for(let round=0;round<3;round++){
  const md=Array.from({length:400},(_,i)=>line(round*400+i,6)).join('\n');
  const r=await tool(env,t,'write_notes',{markdown:md});assert.ok(!r.isError,JSON.stringify(r).slice(0,300));
 }
 const row=await env.DB.prepare('SELECT d.state,w.body FROM sync_documents d JOIN workspaces w USING(uid) WHERE d.uid=?').bind('alice').first();
 assert.match(row.state,/^r2:alice\/sync-store\/state\//,'large state is kept in R2');
 assert.match(row.body,/^r2:alice\/sync-store\/body\//,'large notes copy is kept in R2');
 assert.deepEqual([...objects.keys()].filter(k=>k.includes('/sync-store/')).sort(),[row.state.slice(3),row.body.slice(3)].sort(),'superseded copies are deleted');
 const seen=await serverDoc(env);assert.equal(seen.tables.bullets.length,1201);
 const found=(await tool(env,t,'search',{query:'Note 1199'})).content[0].text;assert.match(found,/Note 1199/);
 const legacy=await call(env,'GET','/workspace');assert.equal(legacy.status,200);assert.equal((await legacy.json()).doc.tables.bullets.length,1201,'legacy reads resolve the R2 copy');
});
