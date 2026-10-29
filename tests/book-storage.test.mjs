import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {empty,archive,parseArchive} from './.build/data.mjs';
import {booksRoute,cleanupBooks,storageUsage} from '../cloud/books.mjs';
import {route,readLimited} from '../cloud/worker.mjs';
import {BOOK_LIMIT,STORAGE_LIMIT,registerBooks,validateReadingBooks,checkBook} from '../src/book-storage.mjs';
// Model the Workers fixed-length stream, including underflow/overflow failures.
globalThis.FixedLengthStream=class{constructor(length){let size=0;const stream=new TransformStream({transform(chunk,c){size+=chunk.length;if(size>length)throw Error('too long');c.enqueue(chunk);},flush(){if(size!==length)throw Error('too short');}});this.readable=stream.readable;this.writable=stream.writable;}};
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));const objects=new Map();const env={BOOK_UPLOADS_ENABLED:'true',DB:{prepare(sql){let args=[];return{bind(...next){args=next;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}},FILES:{async put(key,body,options){const bytes=await new Response(body).arrayBuffer();if(options.sha256&&createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==options.sha256)throw Error('checksum');objects.set(key,new Uint8Array(bytes));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};return {env,sqlite,objects};}
const request=(path,method='GET',body)=>new Request('https://sync.test'+path,{method,...(body===undefined?{}:{body:typeof body==='object'&&!(body instanceof Uint8Array)?JSON.stringify(body):body})});
const hash=value=>createHash('sha256').update(value).digest('hex');
const details=(bytes=new TextEncoder().encode('%PDF-1.7\nfixture'),extra={})=>({id:crypto.randomUUID(),name:'Reading.pdf',size:bytes.length,hash:hash(bytes),...extra});
const send=(env,path,method='GET',body,uid='alice')=>booksRoute(request(path,method,body),env,uid,{readLimited});
test('boundaries, library metadata and repeated widget references retain one book identity',()=>{
 assert.doesNotThrow(()=>checkBook({name:'Book.epub',size:BOOK_LIMIT}));assert.throws(()=>checkBook({name:'Book.pdf',size:BOOK_LIMIT+1}),/25 MiB/);assert.throws(()=>checkBook({name:'book.exe',size:1}),/PDF or EPUB/);
 const b={...details(),format:'pdf',createdAt:Date.now()},doc={web:{}};const next=registerBooks(doc,[b,b]);assert.equal(Object.keys(next.web.readingBooks).length,1);assert.equal(registerBooks(next,[b]),next);assert.doesNotThrow(()=>validateReadingBooks(next.web.readingBooks));assert.throws(()=>validateReadingBooks({...next.web.readingBooks,[b.id]:{...next.web.readingBooks[b.id],position:-1}}));
});
test('streamed uploads, checksum integrity, per-account isolation, deduplication and deletion',async()=>{
 const {env,sqlite,objects}=fixture();try{
 const bytes=new TextEncoder().encode('%PDF-1.7\nfixture'),b=details(bytes);
 let response=await send(env,'/books','POST',b);assert.equal(response.status,201);assert.equal((await storageUsage(env,'alice')).books,bytes.length);
 response=await send(env,'/books/'+b.id,'PUT',bytes);assert.equal((await response.json()).state,'ready');assert.equal(objects.size,1);
 const duplicate=await(await send(env,'/books','POST',{...b,id:crypto.randomUUID()})).json();assert.equal(duplicate.book.id,b.id);assert.equal(duplicate.state,'ready');
 await assert.rejects(send(env,'/books/'+b.id,'GET',undefined,'bob'),e=>e.status===404);assert.equal((await(await send(env,'/books','GET',undefined,'bob')).json()).books.length,0);
 assert.deepEqual(new Uint8Array(await(await send(env,'/books/'+b.id)).arrayBuffer()),bytes);
 env.BOOK_UPLOADS_ENABLED='false';await assert.rejects(send(env,'/books','POST',details()),e=>e.status===503);assert.equal((await send(env,'/books/'+b.id)).status,200);
 await send(env,'/books/'+b.id,'DELETE');assert.equal(objects.size,0);assert.equal((await storageUsage(env,'alice')).books,0);await assert.rejects(send(env,'/books/'+b.id),e=>e.status===410);
 assert.equal((await send(env,'/books/'+b.id,'DELETE')).status,200);
 }finally{sqlite.close();}
});
test('combined account quota is atomic with simultaneous book and legacy attachment reservations',async()=>{
 const {env,sqlite}=fixture();try{
 for(let i=0;i<3;i++)sqlite.prepare("INSERT INTO books VALUES('alice',?,'existing.pdf','pdf',?,?,'ready',0,0)").run(crypto.randomUUID(),BOOK_LIMIT,'old-'+i);
 const one=details(undefined,{size:BOOK_LIMIT,hash:'a'.repeat(64)}),two=details(undefined,{size:BOOK_LIMIT,hash:'b'.repeat(64)});
 const attempts=await Promise.allSettled([send(env,'/books','POST',one),send(env,'/books','POST',two)]);assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal((await storageUsage(env,'alice')).books,STORAGE_LIMIT);
 const bytes=new TextEncoder().encode('image');await assert.rejects(route(new Request('https://sync.test/assets/'+hash(bytes),{method:'PUT',headers:{Authorization:'Bearer alice'},body:bytes}),env,async()=> 'alice'),e=>e.status===413);
 }finally{sqlite.close();}
});
test('failed checksums and truncated uploads release quota; failed deletes retain it until cleanup succeeds',async()=>{
 const {env,sqlite}=fixture();try{
 const bytes=new TextEncoder().encode('%PDF-1.7\nfixture'),b=details(bytes);await send(env,'/books','POST',b);
 await assert.rejects(send(env,'/books/'+b.id,'PUT',new Uint8Array(bytes.length)),e=>e.status===502);assert.equal((await storageUsage(env,'alice')).books,0);
 const shorter=details(bytes);await send(env,'/books','POST',shorter);await assert.rejects(send(env,'/books/'+shorter.id,'PUT',bytes.slice(1)),e=>e.status===502);assert.equal((await storageUsage(env,'alice')).books,0);
 const c=details(bytes);await send(env,'/books','POST',c);await send(env,'/books/'+c.id,'PUT',bytes);const remove=env.FILES.delete;env.FILES.delete=async()=>{throw Error('offline');};await assert.rejects(send(env,'/books/'+c.id,'DELETE'));assert.equal((await storageUsage(env,'alice')).books,bytes.length);
 env.FILES.delete=remove;await cleanupBooks(env,Date.now()+1);assert.equal((await storageUsage(env,'alice')).books,0);
 }finally{sqlite.close();}
});
test('abandoned reservations expire without touching ready books; body overflow cannot evade the reserved quota',async()=>{
 const {env,sqlite}=fixture();try{
 const bytes=new TextEncoder().encode('%PDF-1.7\nfixture'),b=details(bytes);await send(env,'/books','POST',b);await cleanupBooks(env,Date.now()+16*60000);assert.equal((await storageUsage(env,'alice')).books,0);
 const c=details(bytes);await send(env,'/books','POST',c);await assert.rejects(send(env,'/books/'+c.id,'PUT',new Uint8Array(bytes.length+1)),e=>e.status===502);assert.equal((await storageUsage(env,'alice')).books,0);
 }finally{sqlite.close();}
});
test('in-flight uploads cannot be submitted or deleted twice',async()=>{
 const {env,sqlite}=fixture();try{
 const bytes=new TextEncoder().encode('%PDF-1.7\nfixture'),b=details(bytes);await send(env,'/books','POST',b);
 const put=env.FILES.put;let finish,started;const signal=new Promise(r=>started=r),pending=new Promise(r=>finish=r);env.FILES.put=async(...args)=>{await put(...args);started();await pending;};
 const upload=send(env,'/books/'+b.id,'PUT',bytes);await signal;
 await assert.rejects(send(env,'/books/'+b.id,'PUT',bytes),e=>e.status===409);await assert.rejects(send(env,'/books/'+b.id,'DELETE'),e=>e.status===409);assert.equal((await storageUsage(env,'alice')).books,bytes.length);
 finish();assert.equal((await upload).status,200);
 }finally{sqlite.close();}
});

test('full backups retain reading metadata without embedding originals; Android export fails explicitly',async()=>{
 const book={...details(),format:'pdf',createdAt:Date.now()},doc=registerBooks(empty(),[book]);doc.web.readingBooks[book.id].position=18;
 const result=await parseArchive(await archive(doc,new Map()));assert.equal(result.doc.web.readingBooks[book.id].position,18);assert.equal(result.assets.size,0);
 await assert.rejects(archive(doc,new Map(),true),/Reading book metadata/);
});

test('reimporting a deleted original after restoring metadata retains progress without replaying a deleted identity',()=>{
 const old={...details(),format:'pdf',createdAt:Date.now()},doc=registerBooks(empty(),[old]);doc.web.readingBooks[old.id].position=18;
 const fresh={...old,id:crypto.randomUUID()},next=registerBooks(doc,[fresh]);
 assert.equal(next.web.readingBooks[fresh.id].position,18);assert.equal(next.web.readingBooks[old.id].deleted,true);
 assert.equal(registerBooks(next,[old]),next,'stale listing cannot resurrect the deleted identity');
});
