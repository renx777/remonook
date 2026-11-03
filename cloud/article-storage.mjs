import {STORAGE_LIMIT} from '../src/book-storage.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const articleKey=(uid,hash)=>uid+'/articles/'+hash;
export async function storeArticle(env,uid,bytes,hash){
 if(bytes.length>2*1024*1024)fail('The saved article exceeds 2 MiB.',413);
 const now=Date.now();
 const existing=await env.DB.prepare('SELECT * FROM article_snapshots WHERE uid=? AND hash=?').bind(uid,hash).first();
 if(existing?.state==='ready')return;
 if(existing&&existing.state!=='deleted')fail('This article is still being saved. Retry shortly.',409);
 const row=await env.DB.prepare(`INSERT INTO article_snapshots(uid,hash,size,state,created_at,expires_at)
 SELECT ?,?,?,'pending',?,? WHERE
 (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?)+(SELECT COALESCE(SUM(size),0) FROM books WHERE uid=? AND state!='deleted')+(SELECT COALESCE(SUM(size),0) FROM article_snapshots WHERE uid=? AND state!='deleted')+?<=?
 ON CONFLICT(uid,hash) DO UPDATE SET size=excluded.size,state='pending',expires_at=excluded.expires_at WHERE article_snapshots.state='deleted' RETURNING *`).bind(uid,hash,bytes.length,now,now+15*60000,uid,uid,uid,bytes.length,STORAGE_LIMIT).first();
 if(!row)fail('Combined storage is full (100 MiB).',413);
 try{await env.FILES.put(articleKey(uid,hash),bytes,{httpMetadata:{contentType:'application/json'}});await env.DB.prepare("UPDATE article_snapshots SET state='ready',expires_at=0 WHERE uid=? AND hash=? AND state='pending'").bind(uid,hash).run();}
 catch(e){await env.DB.prepare("UPDATE article_snapshots SET state='deleting',expires_at=? WHERE uid=? AND hash=? AND state='pending'").bind(Date.now(),uid,hash).run();throw e;}
}
export async function cleanupArticles(env,now=Date.now()){
 const{results}=await env.DB.prepare("SELECT uid,hash,state,expires_at FROM article_snapshots WHERE state IN ('pending','deleting') AND expires_at<? LIMIT 25").bind(now).all();
 for(const row of results){const claim=await env.DB.prepare("UPDATE article_snapshots SET state='deleting',expires_at=? WHERE uid=? AND hash=? AND state=? AND expires_at=? RETURNING hash").bind(now+3600000,row.uid,row.hash,row.state,row.expires_at).first();if(!claim)continue;try{await env.FILES.delete(articleKey(row.uid,row.hash));await env.DB.prepare("UPDATE article_snapshots SET state='deleted',size=0 WHERE uid=? AND hash=? AND state='deleting'").bind(row.uid,row.hash).run();}catch{}}
}
