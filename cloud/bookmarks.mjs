import {articleKey,storeArticle} from './article-storage.mjs';
import {loadStored} from './sync-v2.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const json=value=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
const hashOf=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function bookmarksRoute(request,env,uid,{readLimited}){
 const url=new URL(request.url);
 if(!env.FILES)fail('Article storage is unavailable.',503);
 if(url.pathname==='/bookmarks/capture'&&request.method==='POST'){
  let body;try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));}catch(e){if(e.status)throw e;fail('Invalid webpage address.');}
  if(!env.ARTICLE_CAPTURE||!env.ARTICLE_RATE_LIMITER)fail('Article capture is awaiting server activation. Your bookmark is saved.',503);
  if(!(await env.ARTICLE_RATE_LIMITER.limit({key:uid})).success)fail('Too many capture requests. Try again shortly.',429);
  const response=await env.ARTICLE_CAPTURE.fetch(new Request('https://capture.internal/',{method:'POST',body:JSON.stringify({url:body.url})}));if(!response.ok)fail('Reader unavailable for this page. Your bookmark is saved.',422);
  const bytes=await readLimited(response,2*1024*1024),article=JSON.parse(new TextDecoder().decode(bytes)),hash=await hashOf(bytes);
  await storeArticle(env,uid,bytes,hash);return json({article,snapshot:{hash,size:bytes.length}});
 }
 const match=url.pathname.match(/^\/bookmarks\/snapshots\/([a-f0-9]{64})$/);if(!match)fail('Not found.',404);const hash=match[1];
 if(request.method==='PUT'){
  const bytes=await readLimited(request,2*1024*1024);if(await hashOf(bytes)!==hash)fail('Snapshot checksum mismatch.');
  let article;try{article=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid article snapshot.');}
  if(article.schema!==1||typeof article.html!=='string'||typeof article.title!=='string'||!/^https?:\/\//.test(article.url))fail('Invalid article snapshot.');
  await storeArticle(env,uid,bytes,hash);return json({saved:true});
 }
 const row=await env.DB.prepare("SELECT * FROM article_snapshots WHERE uid=? AND hash=? AND state='ready'").bind(uid,hash).first();if(!row)fail('Article snapshot not found.',404);
 if(request.method==='GET'){const object=await env.FILES.get(articleKey(uid,hash));if(!object)fail('Article snapshot not found.',404);return new Response(object.body,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(request.method==='DELETE'){
  const workspace=await env.DB.prepare('SELECT body FROM workspaces WHERE uid=?').bind(uid).first(),text=workspace&&await loadStored(env,workspace.body);if(workspace&&text===null)fail('Your notes are busy syncing. Try again in a moment.',503);if(workspace){const{doc}=JSON.parse(text);if(Object.values(doc?.web?.bookmarks||{}).some(b=>b.snapshotHash===hash)||Object.values(doc?.web?.bookmarkSources||{}).some(s=>s.snapshotHash===hash))fail('This snapshot is still referenced by your notes or bookmarks.',409);}
  await env.DB.prepare("UPDATE article_snapshots SET state='deleting',expires_at=? WHERE uid=? AND hash=? AND state='ready'").bind(Date.now(),uid,hash).run();await env.FILES.delete(articleKey(uid,hash));await env.DB.prepare("UPDATE article_snapshots SET state='deleted',size=0 WHERE uid=? AND hash=?").bind(uid,hash).run();return json({deleted:true});
 }
 fail('Method not allowed.',405);
}
