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

test('MCP: tokens, read and write tools, versions, idempotency, scopes and sync to devices',async()=>{
 const env=database(),doc=empty();doc.tables.bullets=[bullet('trip',{text:'Trip to Bengaluru #travel'}),bullet('flight',{parentId:'trip',text:'Flight booked',formatting:'7:13:BOLD'})];
 await call(env,'PUT','/workspace',{baseRevision:0,doc,assets:[]});
 // Without a token nothing is readable.
 assert.equal((await rpc(env,'not-a-token','tools/list')).status,401);
 const created=await(await call(env,'POST','/mcp/tokens',{name:'Claude Desktop',scopes:['read','write']})).json();
 assert.match(created.token,/^rnk_[a-f0-9]{16}_[a-f0-9]{48}$/);
 const t=created.token;
 const init=await rpc(env,t,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
 assert.equal(init.body.result.serverInfo.name,'RemoNook');assert.equal((await rpc(env,t,'notifications/initialized')).status,202);
 const names=(await rpc(env,t,'tools/list')).body.result.tools.map(x=>x.name);
 assert.ok(names.includes('write_notes')&&!names.includes('delete_notes'),'tools follow the token scopes');
 // Read
 const page=await tool(env,t,'read_page',{id:'trip'});assert.match(page.content[0].text,/- Flight \*\*booked\*\* <!-- id=flight v=\w+ -->/);
 assert.match((await tool(env,t,'search',{query:'#travel'})).content[0].text,/Trip to Bengaluru/);
 // Write Markdown with a table, a task and a diagram
 const w=await tool(env,t,'write_notes',{parent_id:'trip',markdown:'## Budget\n| Item | Cost |\n|---|---|\n| Flight | 6480 |\n- [ ] Book hotel\n```mermaid\ngraph TD; A-->B\n```',idempotency_key:'k1'});
 assert.equal(w.isError,undefined);assert.match(w.content[0].text,/Added 4 bullets/);
 let d=await serverDoc(env);const budget=d.tables.bullets.find(n=>n.text==='Budget');
 assert.equal(budget.parentId,'trip');assert.ok(d.tables.bullets.some(n=>n.parentId===budget.id&&n.text.startsWith('```remo-table')));
 assert.equal(d.tables.bullets.find(n=>n.text==='Book hotel').taskState,'TODO');
 // Retrying with the same key does not add again
 assert.match((await tool(env,t,'write_notes',{parent_id:'trip',markdown:'## Budget\n| Item | Cost |\n|---|---|\n| Flight | 6480 |\n- [ ] Book hotel\n```mermaid\ngraph TD; A-->B\n```',idempotency_key:'k1'})).content[0].text,/Already applied/);
 assert.equal((await serverDoc(env)).tables.bullets.filter(n=>n.text==='Budget').length,1);
 // Version-checked update keeps formatting it does not touch
 const v=/id=flight v=(\w+)/.exec((await tool(env,t,'read_page',{id:'trip'})).content[0].text)[1];
 const stale=await tool(env,t,'update_note',{id:'flight',version:'nope',markdown:'x'});assert.equal(stale.isError,true);assert.match(stale.content[0].text,/changed since you read it/);
 assert.equal((await tool(env,t,'update_note',{id:'flight',version:v,markdown:'Flight **booked**, seat 12A'})).isError,undefined);
 d=await serverDoc(env);const flight=d.tables.bullets.find(n=>n.id==='flight');assert.equal(flight.text,'Flight booked, seat 12A');assert.equal(flight.formatting,'7:13:BOLD');
 // Emoji shortcodes become animated Noto emoji in the workspace library; code is left alone
 await tool(env,t,'write_notes',{parent_id:'trip',markdown:'- Launch :rocket: :tada: and `:fire:`'});
 d=await serverDoc(env);const launch=d.tables.bullets.find(n=>n.text.startsWith('Launch'));
 assert.equal(launch.text,'Launch :noto_1f680: :noto_1f389: and :fire:');assert.ok(['noto_1f680.webp','noto_1f389.webp'].every(f=>d.tables.emojis.some(e=>e.fileName===f)));
 // Unsupported Markdown is refused with a reason, nothing saved
 const strike=await tool(env,t,'write_notes',{markdown:'- ~~gone~~'});assert.equal(strike.isError,true);assert.match(strike.content[0].text,/strikethrough/);
 // Study content
 assert.match((await tool(env,t,'create_flashcards',{parent_id:'trip',cards:[{question:'Capital of Karnataka?',answer:'Bengaluru'}]})).content[0].text,/Created 1 flashcard/);
 assert.match((await tool(env,t,'create_mcqs',{questions:[{question:'2+2?',options:['3','4','5','6'],correct_index:1}]})).content[0].text,/Created 1 multiple-choice/);
 d=await serverDoc(env);const q=d.tables.bullets.find(n=>n.text==='Capital of Karnataka?');assert.equal(q.kind,'QUESTION');assert.ok(d.tables.cards.some(c=>c.id===q.id),'flashcards become study cards');
 const mcq=d.tables.bullets.find(n=>n.text==='2+2?');assert.equal(d.web.mcqs[mcq.id].optionIds.length,4);
 assert.match((await tool(env,t,'add_bookmark',{url:'https://example.com/a',tags:['#ml'],note:'Read later'})).content[0].text,/Saved to Bookmarks/);
 assert.ok(Object.values((await serverDoc(env)).web.bookmarks).some(b=>b.url==='https://example.com/a'&&b.tags.includes('ml')));
 // This token cannot delete
 const denied=await tool(env,t,'delete_notes',{ids:['flight']});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/may not delete/);
 const full=(await(await call(env,'POST','/mcp/tokens',{name:'Codex',scopes:['read','write','delete']})).json()).token;
 assert.match((await tool(env,full,'delete_notes',{ids:['flight']})).content[0].text,/Moved 1 bullet to Trash/);
 d=await serverDoc(env);assert.ok(!d.tables.bullets.some(n=>n.id==='flight'));assert.ok(d.tables.trash.some(e=>JSON.parse(e.payload).nodes.some(n=>n.id==='flight')),'deleted notes are restorable from Trash');
 // Activity and revocation
 const activity=await(await call(env,'GET','/mcp/activity')).json();assert.ok(activity.activity.length>=5);assert.ok(activity.activity.every(a=>!JSON.stringify(a).includes('Bengaluru')),'activity holds no note text');
 const list=await(await call(env,'GET','/mcp/tokens')).json();assert.equal(list.tokens.length,2);
 await call(env,'DELETE','/mcp/tokens/'+created.id);assert.equal((await rpc(env,t,'tools/list')).status,401);
 // Another user cannot see these notes
 const bob=(await(await call(env,'POST','/mcp/tokens',{name:'x',scopes:['read']},'bob')).json()).token;
 assert.doesNotMatch((await tool(env,bob,'search',{query:'Trip'})).content[0].text,/Bengaluru/);
});
