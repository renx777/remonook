// Replays the Bookmarks and Dashboard flows through the real sync route, one batch at a
// time, and prints the first batch the server rejects. Run: node tests/repro-sync-rejection.mjs
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {empty} from './.build/data.mjs';
import {Y,seed,sharedState,openShared,applyIntent,vector,delta,pack,unpack} from '../src/sync-crdt.mjs';
import {bullet} from '../src/domain.mjs';
import {route} from '../cloud/worker.mjs';
import {addBookmark,patchBookmark,webHighlight,bookmarkNote} from '../src/bookmarks.mjs';
import {addWidget,widgetCatalog,saveDashboardLayout,widgetLayout,dashboard as readDashboard,addHabit,toggleHabit,updateWidget} from '../src/dashboard.mjs';

function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const DB={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},run(){const r=sqlite.prepare(sql).run(...params);return{success:true,meta:{changes:r.changes}};},async all(){return{results:sqlite.prepare(sql).all(...params)};}};},async batch(list){sqlite.exec('BEGIN');try{for(const s of list)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}return[];}};
 return{DB,FILES:null,FIREBASE_PROJECT_ID:'test',ALLOWED_ORIGINS:'https://sync.test',DB_RAW:sqlite};
}
const env=database();
const call=(method,path,body,headers={})=>route(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer alice',...headers},...(body?{body:JSON.stringify(body)}:{})}),env,async t=>t);

let base=empty();base.tables.bullets=[bullet('a',{text:'Learn SQL.'})];
await call('PUT','/workspace',{baseRevision:0,doc:base,assets:[]});
let server=await(await call('GET','/sync/v2')).json();
let current=base;

async function send(label,next){
 // Build the update the client would send against the server's state.
 const y=openShared(server.update??sharedState(seed(current)));
 const v=vector(y);
 applyIntent(y,current,next);
 const update=delta(y,v);
 const body={operationId:crypto.randomUUID(),update,vector:vector(y)};
 const r=await call('POST','/sync/v2',body,{'X-Remo-Capabilities':'workdays-v2'});
 if(r.status!==200){const t=await r.text();console.log('REJECTED at',label,r.status,t);process.exitCode=1;return false;}
 server=await(await call('GET','/sync/v2')).json();current=next;console.log('ok  ',label);return true;
}

// 1. Save a page (addBookmark + metadata)
const r1=addBookmark(current,'https://github.com/x/rag');
let s1=patchBookmark(r1.doc,r1.bookmark.id,{title:'What is retrieval-augmented generation (RAG)?',snapshotHash:'a'.repeat(64),readingMinutes:10,excerpt:'Useful ideas'});
if(!await send('save bookmark',s1))process.exit();
// 2. Text highlight + "Add note" (empty thought)
const b=s1.web.bookmarks[r1.bookmark.id];
const h=webHighlight(s1,{...b,snapshotHash:'a'.repeat(64)},{start:0,end:5,exact:'Hello',prefix:'',suffix:' world'},'yellow','','highlight');
if(!await send('highlight',h))process.exit();
const hid=Object.values(h.web.webHighlights)[0].bulletId;
const thought={...h,tables:{...h.tables,bullets:[...h.tables.bullets,bullet('thought-1',{parentId:hid,text:'',position:0})]}};
if(!await send('add note (empty thought)',thought))process.exit();
// 3. Dashboard: add every widget, save layouts for each breakpoint, add a habit
let dash=copy(thought);
for(const w of widgetCatalog)dash=addWidget(dash,w.kind);
if(!await send('add widgets',dash))process.exit();
for(const bp of ['lg','md','sm']){const ws=Object.values(readDashboard(dash).widgets).filter(x=>!x.removed);dash=saveDashboardLayout(dash,bp,widgetLayout(ws,bp));if(!await send('layout '+bp,dash))process.exit();}
const hab=addHabit(dash,'Read for 10 minutes');if(!await send('add habit',hab))process.exit();
console.log('all batches accepted');

function copy(x){return structuredClone(x);}
