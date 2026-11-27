import {STORAGE_LIMIT} from '../src/book-storage.mjs';
export const FILE_LIMIT=2*1024*1024,ACCOUNT_LIMIT=20*1024*1024;
export async function reserveAttachment(env,uid,hash,size){
 await env.DB.prepare("INSERT OR IGNORE INTO assets(uid,hash,size) SELECT ?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?) + ? <= ? AND (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?) + (SELECT COALESCE(SUM(size),0) FROM books WHERE uid=? AND state!='deleted') + (SELECT COALESCE(SUM(size),0) FROM article_snapshots WHERE uid=? AND state!='deleted') + ? <= ?").bind(uid,hash,size,uid,size,ACCOUNT_LIMIT,uid,uid,uid,size,STORAGE_LIMIT).run();
 const reserved=await env.DB.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').bind(uid,hash).first();
 if(!reserved||reserved.size!==size)throw Object.assign(Error('Attachment storage is full (20 MiB), or combined book, article and attachment storage exceeds 100 MiB.'),{status:413,code:'ATTACHMENT_QUOTA_FULL'});
}
