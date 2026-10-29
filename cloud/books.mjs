import {BOOK_LIMIT,STORAGE_LIMIT,BOOK_COUNT_LIMIT,checkBook,bookId} from '../src/book-storage.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fields=row=>({id:row.id,name:row.name,format:row.format,size:row.size,hash:row.hash,createdAt:row.created_at});
const key=(uid,id)=>uid+'/books/'+id;
export async function storageUsage(env,uid){
 return env.DB.prepare(`SELECT
 (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?) AS attachments,
 (SELECT COALESCE(SUM(size),0) FROM books WHERE uid=? AND state!='deleted') AS books,
 (SELECT COUNT(*) FROM books WHERE uid=? AND state!='deleted') AS count`).bind(uid,uid,uid).first();
}
export async function cleanupBooks(env,now=Date.now(),uid=null){
 if(!env.FILES)return;
 const {results}=await env.DB.prepare("SELECT uid,id,state,expires_at FROM books WHERE state IN ('pending','uploading','deleting') AND expires_at<? AND (? IS NULL OR uid=?) LIMIT 25").bind(now,uid,uid).all();
 for(const row of results){
  const claimed=await env.DB.prepare("UPDATE books SET state='deleting',expires_at=? WHERE uid=? AND id=? AND state=? AND expires_at=? RETURNING id").bind(now+3600000,row.uid,row.id,row.state,row.expires_at).first();
  if(!claimed)continue;
  try{await env.FILES.delete(key(row.uid,row.id));await env.DB.prepare("UPDATE books SET state='deleted',size=0 WHERE uid=? AND id=? AND state='deleting'").bind(row.uid,row.id).run();}
  catch{/* Retain allocation and retry on the next scheduled cleanup. */}
 }
}
export async function booksRoute(request,env,uid,{readLimited}){
 const url=new URL(request.url);
 if(url.pathname==='/storage'&&request.method==='GET'){
  await cleanupBooks(env,Date.now(),uid);
  const usage=await storageUsage(env,uid);
  return json({...usage,total:usage.attachments+usage.books,limit:STORAGE_LIMIT,bookLimit:BOOK_LIMIT,uploadsEnabled:env.BOOK_UPLOADS_ENABLED==='true'});
 }
 if(!env.FILES)fail('Book storage is unavailable.',503);
 if(url.pathname==='/books'&&request.method==='GET'){
  const {results}=await env.DB.prepare("SELECT * FROM books WHERE uid=? AND state='ready' ORDER BY created_at,id LIMIT 100").bind(uid).all();return json({books:results.map(fields)});
 }
 if(url.pathname==='/books'&&request.method==='POST'){
  if(env.BOOK_UPLOADS_ENABLED!=='true')fail('New book uploads are paused. Your saved books and notes remain available.',503);
  await cleanupBooks(env,Date.now(),uid);
  let body;try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,2048)));}catch{fail('Invalid book details.');}
  if(!body||typeof body.name!=='string'||!bookId(body.id)||typeof body.hash!=='string'||!/^[a-f0-9]{64}$/.test(body.hash))fail('Invalid book details.');
  let format;try{format=checkBook(body);}catch(e){fail(e.message);}
  const existing=await env.DB.prepare('SELECT * FROM books WHERE uid=? AND (id=? OR (hash=? AND state!=\'deleted\')) ORDER BY (id=?) DESC LIMIT 1').bind(uid,body.id,body.hash,body.id).first();
  if(existing){
   if(existing.hash!==body.hash||existing.size!==body.size||existing.state==='deleted')fail('This upload identifier is no longer available. Choose the file again.',409);
   if(existing.state==='deleting')fail('This book is being deleted. Try again shortly.',409);
   return json({book:fields(existing),state:existing.state});
  }
  const now=Date.now();
  const reserved=await env.DB.prepare(`INSERT OR IGNORE INTO books(uid,id,name,format,size,hash,state,created_at,expires_at)
   SELECT ?,?,?,?,?,?,'pending',?,? WHERE
   (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?)+(SELECT COALESCE(SUM(size),0) FROM books WHERE uid=? AND state!='deleted')+?<=?
   AND (SELECT COUNT(*) FROM books WHERE uid=? AND state!='deleted')<? RETURNING *`).bind(uid,body.id,body.name,format,body.size,body.hash,now,now+15*60000,uid,uid,body.size,STORAGE_LIMIT,uid,BOOK_COUNT_LIMIT).first();
  if(!reserved){
   const raced=await env.DB.prepare("SELECT * FROM books WHERE uid=? AND hash=? AND state='ready'").bind(uid,body.hash).first();
   if(raced&&raced.size===body.size)return json({book:fields(raced),state:'ready'});
   fail('Book storage is full or another upload is in progress. Accounts support 100 MiB combined storage and up to 100 books.',413);
  }
  return json({book:fields(reserved),state:'pending'},201);
 }
 const match=url.pathname.match(/^\/books\/([a-f0-9-]{36})$/);if(!match)fail('Not found.',404);
 const id=match[1],objectKey=key(uid,id);
 const row=await env.DB.prepare('SELECT * FROM books WHERE uid=? AND id=?').bind(uid,id).first();if(!row)fail('Book not found.',404);
 if(request.method==='GET'){
  if(row.state!=='ready')fail(row.state==='deleted'?'This book was deleted.':'This book is not ready yet.',row.state==='deleted'?410:409);
  const object=await env.FILES.get(objectKey);if(!object)fail('The book file is unavailable. Reimport your original file.',404);
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(row.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }
 if(request.method==='PUT'){
  if(env.BOOK_UPLOADS_ENABLED!=='true')fail('New book uploads are paused. Your saved books and notes remain available.',503);
  if(row.state==='ready')return json({book:fields(row),state:'ready'});
  if(!request.body)fail('Choose a book file.');
  const claimed=await env.DB.prepare("UPDATE books SET state='uploading',expires_at=? WHERE uid=? AND id=? AND state='pending' AND expires_at>? RETURNING id").bind(Date.now()+3600000,uid,id,Date.now()).first();
  if(!claimed)fail('This upload is already running or expired. Try again shortly.',409);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10*60000);
  try{
   // R2 checks SHA-256; FixedLengthStream enforces the reserved byte length.
   // Both transfer branches settle before any allocation is released.
   const fixed=new FixedLengthStream(row.size);
   const results=await Promise.allSettled([
    request.body.pipeTo(fixed.writable,{signal:controller.signal}),
    env.FILES.put(objectKey,fixed.readable,{sha256:row.hash,httpMetadata:{contentType:'application/octet-stream'},storageClass:'Standard'}).catch(error=>{controller.abort();throw error;})
   ]);
   const rejected=results.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
   const saved=await env.DB.prepare("UPDATE books SET state='ready',expires_at=0 WHERE uid=? AND id=? AND state='uploading' RETURNING *").bind(uid,id).first();
   if(!saved)throw Error('Upload was cancelled.');
   return json({book:fields(saved),state:'ready'});
  }catch{
   // Delete before releasing quota. If deletion fails, cleanup retries later.
   await env.DB.prepare("UPDATE books SET state='deleting',expires_at=? WHERE uid=? AND id=? AND state='uploading'").bind(Date.now(),uid,id).run();
   try{await env.FILES.delete(objectKey);await env.DB.prepare("UPDATE books SET state='deleted',size=0 WHERE uid=? AND id=? AND state='deleting'").bind(uid,id).run();}catch{}
   fail('Book upload did not finish. Choose the file again to retry.',502);
  }finally{clearTimeout(timeout);}
 }
 if(request.method==='DELETE'){
  if(row.state==='deleted')return json({deleted:true});
  if(row.state==='uploading')fail('Wait for the current upload to finish before deleting it.',409);
  const claimed=await env.DB.prepare("UPDATE books SET state='deleting',expires_at=? WHERE uid=? AND id=? AND state IN ('ready','pending','deleting') RETURNING id").bind(Date.now(),uid,id).first();
  if(!claimed)fail('Book changed. Refresh the library and try again.',409);
  await env.FILES.delete(objectKey);
  await env.DB.prepare("UPDATE books SET state='deleted',size=0 WHERE uid=? AND id=? AND state='deleting'").bind(uid,id).run();return json({deleted:true});
 }
 fail('Method not allowed.',405);
}
