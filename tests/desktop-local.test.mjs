import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {fileTitle,workspaceMarkdown} from '../src/folder-markdown.mjs';
import {quickCapture,INBOX_ID} from '../src/quick-capture.mjs';

globalThis.localStorage ??= (()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};})();
globalThis.window ??= {dispatchEvent(){}};
globalThis.Event ??= class{constructor(t){this.type=t;}};
const {handleLocalMcp}=await import('./.build/local-mcp.mjs');

const sample=()=>{const doc=empty();doc.tables.bullets=[bullet('trip',{text:'Trip: Bengaluru / Mysuru?'}),bullet('flight',{parentId:'trip',text:'Flight booked',formatting:'0:6:BOLD'}),bullet('todo',{parentId:'flight',text:'Pack',taskState:'TODO'}),bullet('trip2',{text:'Trip: Bengaluru / Mysuru?',position:1}),bullet('con',{text:'CON',position:2}),bullet('blank',{text:'',position:3})];return doc;};

test('folder Markdown: safe unique file names and nested lists',()=>{
 assert.equal(fileTitle('a/b:c*d?'),'a b c d');
 assert.equal(fileTitle('...hidden. '),'hidden');
 assert.equal(fileTitle('nul'),'nul (note)');
 assert.equal(fileTitle(''),'Untitled');
 assert.equal(fileTitle('x'.repeat(200)).length,80);
 const files=workspaceMarkdown(sample());
 assert.deepEqual(files.map(f=>f[0]),['Trip Bengaluru Mysuru.md','Trip Bengaluru Mysuru (2).md','CON (note).md','Untitled.md']);
 assert.equal(files[0][1],'# Trip: Bengaluru / Mysuru?\n\n- **Flight** booked\n  - [ ] Pack\n');
});

test('quick capture: creates the Inbox once, at the top, and appends lines',()=>{
 let {doc,added}=quickCapture(sample(),'buy milk\n- [ ] call mom');
 assert.equal(added,2);
 const top=doc.tables.bullets.filter(n=>n.parentId===null).sort((a,b)=>a.position-b.position);
 assert.equal(top[0].id,INBOX_ID);assert.deepEqual(top.map(n=>n.position),[0,1,2,3,4]);
 ({doc,added}=quickCapture(doc,'third'));
 const inbox=doc.tables.bullets.filter(n=>n.parentId===INBOX_ID).sort((a,b)=>a.position-b.position);
 assert.deepEqual(inbox.map(n=>[n.text,n.taskState]),[['buy milk','NONE'],['call mom','TODO'],['third','NONE']]);
 assert.equal(doc.tables.bullets.filter(n=>n.id===INBOX_ID).length,1);
});

test('local MCP: same tools as the cloud, access levels, saved through the app',async()=>{
 let doc=sample(),saved=0;
 const deps=access=>({getDoc:()=>doc,apply:async next=>{doc=next;saved++;},workspaceName:()=>'Private',access:()=>access});
 const rpc=async(access,method,params,id=1)=>JSON.parse(await handleLocalMcp(JSON.stringify({jsonrpc:'2.0',id,method,params}),deps(access)));
 const init=await rpc('read','initialize',{protocolVersion:'2025-06-18'});
 assert.equal(init.result.protocolVersion,'2025-06-18');
 assert.equal(await handleLocalMcp(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),deps('read')),'');
 const names=a=>rpc(a,'tools/list').then(r=>r.result.tools.map(t=>t.name));
 assert.ok(!(await names('read')).includes('write_notes'));
 assert.ok((await names('write')).includes('write_notes')&&!(await names('write')).includes('delete_notes'));
 assert.ok((await names('delete')).includes('delete_notes'));
 const call=(a,name,args)=>rpc(a,'tools/call',{name,arguments:args}).then(r=>r.result);
 const found=await call('read','search',{query:'Pack'});
 assert.match(found.content[0].text,/Pack <!-- id=todo v=/);
 const denied=await call('read','write_notes',{markdown:'x'});
 assert.equal(denied.isError,true);assert.equal(saved,0);
 const wrote=await call('write','write_notes',{parent_id:'trip',markdown:'- Hotel\n  - Check-in 2pm',idempotency_key:'k1'});
 assert.ok(!wrote.isError,wrote.content[0].text);assert.equal(saved,1);
 assert.ok(doc.tables.bullets.some(n=>n.text==='Check-in 2pm'));
 const again=await call('write','write_notes',{parent_id:'trip',markdown:'- Hotel',idempotency_key:'k1'});
 assert.match(again.content[0].text,/Already applied/);assert.equal(saved,1);
 const stale=await call('write','update_note',{id:'todo',version:'nope',markdown:'x'});
 assert.equal(stale.isError,true);
 const recent=await call('read','recent_changes',{});
 assert.match(recent.content[0].text,/write_notes: Added 2 bullets \(Private\)/);
 const noDoc=JSON.parse(await handleLocalMcp(JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'search',arguments:{query:'x'}}}),{...deps('read'),getDoc:()=>null}));
 assert.equal(noDoc.result.isError,true);
});
