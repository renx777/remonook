import {aiRoute,aiEnabled} from './ai.mjs';
import {cleanupArticles} from './article-storage.mjs';
import {bookmarksRoute} from './bookmarks.mjs';
import {validateBookmarks} from '../src/bookmarks.mjs';
import {validateReading} from '../src/reading.mjs';
import {booksRoute,cleanupBooks} from './books.mjs';
import {STORAGE_LIMIT,validateReadingBooks} from '../src/book-storage.mjs';
import {googleTasksPublic,googleTasksRoute,googleTasksConfigured,cleanupGoogleTasks} from './google-tasks.mjs';
import {syncV2} from './sync-v2.mjs';
import {mcpEndpoint,mcpManage} from './mcp.mjs';
import {oauthPublic,oauthConsent,cleanupOAuth} from './mcp-oauth.mjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
// This cache contains only Google's public verification keys, never user data.
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export const FILE_LIMIT = 2 * 1024 * 1024, ACCOUNT_LIMIT = 20 * 1024 * 1024, NOTE_LIMIT = 900 * 1024;
const json = (body, status=200) => Response.json(body, {status});
const fail = (message, status) => { throw Object.assign(new Error(message), {status}); };
export async function readLimited(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) fail('Upload exceeds the size limit.', 413);
  const reader=request.body?.getReader(); if(!reader)return new Uint8Array();
  let size=0;const chunks=[];
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('Upload exceeds the size limit.',413);}chunks.push(value);} }
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
export async function verifyUser(token, project) {
  if(!project)fail("Firebase project is not configured.",503);
  const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${project}`,audience:project,requiredClaims:['sub','exp','iat','auth_time']});
  const now=Date.now()/1000;
  if(!payload.sub||payload.sub.length>128||typeof payload.iat!=='number'||payload.iat>now||typeof payload.auth_time!=='number'||payload.auth_time>now||!['google.com','password'].includes(payload.firebase?.sign_in_provider))fail('Please sign in with Google or email and password.',401);
  return payload.sub;
}
export function validatePayload(value) {
  if(!value||!Number.isSafeInteger(value.baseRevision)||value.baseRevision<0||!value.doc?.tables||!value.doc?.columns||!value.doc?.preferences||!value.doc?.web||!Array.isArray(value.doc.tables.bullets)||!Array.isArray(value.assets))fail('Invalid workspace.',400);
  validateReadingBooks(value.doc.web.readingBooks);validateReading(value.doc.web);validateBookmarks(value.doc.web);
  if(value.assets.length>2000)fail('Too many attachments.',413);
  let total=0;const paths=new Set();for(const a of value.assets){if(typeof a.path!=='string'||!a.path||a.path.length>500||paths.has(a.path)||!/^[a-f0-9]{64}$/.test(a.hash)||!Number.isSafeInteger(a.size)||a.size<0||a.size>FILE_LIMIT||typeof a.type!=='string'||a.type.length>150)fail('Invalid attachment.',400);paths.add(a.path);total+=a.size;}
  if(total>ACCOUNT_LIMIT)fail('Attachments exceed 20 MiB.',413);
  return value;
}
export async function route(request, env, authenticate=(token)=>verifyUser(token,env.FIREBASE_PROJECT_ID),ctx) {
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  if(url.pathname==='/health'&&request.method==='GET')return json({ok:true,attachments:!!env.FILES,syncProtocol:2,workdaysSchema:2,authProviders:['google.com','password'],bookStorage:1,bookReader:1,aiAssist:1,aiEnabled:aiEnabled(env),bookmarkReader:1,mcp:1,mcpOAuth:1,bookmarkCapture:!!env.ARTICLE_CAPTURE&&!!env.ARTICLE_RATE_LIMITER,googleTasksConfigured:googleTasksConfigured(env)});
  const publicTasks=await googleTasksPublic(request,env);if(publicTasks)return publicTasks;
  // AI apps authenticate with their own access tokens, not Firebase sessions.
  if(url.pathname==='/mcp')return mcpEndpoint(request,env,{readLimited,validatePayload,NOTE_LIMIT});
  if(url.pathname.startsWith('/.well-known/')||['/oauth/register','/oauth/authorize','/oauth/token'].includes(url.pathname)){const r=await oauthPublic(request,env,{readLimited});if(r)return r;}
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)fail('Sign in required.',401);
  let uid;try{uid=await authenticate(token);}catch{fail('Your session expired. Sign in again.',401);}
  if(url.pathname.startsWith('/ai/'))return aiRoute(request,env,uid,{readLimited,waitUntil:ctx?p=>ctx.waitUntil(p):undefined});
  if(url.pathname==='/storage'||url.pathname==='/books'||url.pathname.startsWith('/books/'))return booksRoute(request,env,uid,{readLimited});
  if(url.pathname.startsWith('/integrations/google-tasks/'))return googleTasksRoute(request,env,uid,{readLimited});
  if(url.pathname.startsWith('/bookmarks/'))return bookmarksRoute(request,env,uid,{readLimited});
  if(url.pathname.startsWith('/mcp/'))return mcpManage(request,env,uid,{readLimited});
  if(url.pathname.startsWith('/oauth/requests/')){const r=await oauthConsent(request,env,uid,{readLimited});if(r)return r;}
  if(url.pathname==='/sync/v2')return syncV2(request,env,uid,{readLimited,validatePayload,NOTE_LIMIT});
  if(url.pathname==='/workspace'){
    if(request.method==='GET'){
      const row=await env.DB.prepare('SELECT revision, body FROM workspaces WHERE uid=?').bind(uid).first();
      if(!row)return json({revision:0,doc:null,assets:[]});
      if(JSON.parse(row.body).doc?.web?.workdays?.version===2&&!request.headers.get('X-Remo-Capabilities')?.split(',').map(v=>v.trim()).includes('workdays-v2'))fail('Update RemoNook to sync Workdays. Pending edits remain saved on this device.',426);
      if(request.headers.get('If-None-Match')===String(row.revision))return new Response(null,{status:304});
      return json({revision:row.revision,...JSON.parse(row.body)});
    }
    if(request.method==='PUT'){
      const migrated=await env.DB.prepare('SELECT revision FROM sync_documents WHERE uid=?').bind(uid).first();
      if(migrated)fail('An app update is ready. Reload this tab to continue. Your edits remain saved on this device.',426);
      let value;try{value=JSON.parse(new TextDecoder().decode(await readLimited(request,NOTE_LIMIT)));}catch(e){if(e.status)throw e;fail('Invalid JSON.',400);}
      validatePayload(value);
      // Every advertised attachment must already be privately stored for this user.
      if(value.assets.length){if(!env.FILES)fail('Attachment sync is awaiting storage activation.',503);for(const a of value.assets){const found=await env.DB.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').bind(uid,a.hash).first();if(!found||found.size!==a.size)fail('Upload attachments before saving notes.',409);}}
      const body=JSON.stringify({doc:value.doc,assets:value.assets});
      const result=await env.DB.prepare('INSERT INTO workspaces(uid,revision,body,updated_at) SELECT ?,1,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM workspaces WHERE uid=?)) AND NOT EXISTS(SELECT 1 FROM sync_documents WHERE uid=?) ON CONFLICT(uid) DO UPDATE SET revision=revision+1,body=excluded.body,updated_at=excluded.updated_at WHERE workspaces.revision=? AND NOT EXISTS(SELECT 1 FROM sync_documents WHERE uid=?) RETURNING revision').bind(uid,body,Date.now(),value.baseRevision,uid,uid,value.baseRevision,uid).first();
      // An absent workspace only accepts revision zero (client cannot recreate a deleted account accidentally).
      if(!result)fail('Cloud notes changed on another device.',409);
      return json({revision:result.revision});
    }
  }
  const match=url.pathname.match(/^\/assets\/([a-f0-9]{64})$/);
  if(match){
    if(!env.FILES)fail('Attachment sync is awaiting storage activation.',503);
    const hash=match[1],key=uid+'/'+hash;
    if(request.method==='GET'){
      const object=await env.FILES.get(key);if(!object)fail('Attachment not found.',404);
      return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
    }
    if(request.method==='PUT'){
      const bytes=await readLimited(request,FILE_LIMIT);
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(actual!==hash)fail('Attachment checksum mismatch.',400);
      await env.DB.prepare('INSERT OR IGNORE INTO assets(uid,hash,size) SELECT ?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?) + ? <= ? AND (SELECT COALESCE(SUM(size),0) FROM assets WHERE uid=?) + (SELECT COALESCE(SUM(size),0) FROM books WHERE uid=? AND state!=\'deleted\') + (SELECT COALESCE(SUM(size),0) FROM article_snapshots WHERE uid=? AND state!=\'deleted\') + ? <= ?').bind(uid,hash,bytes.length,uid,bytes.length,ACCOUNT_LIMIT,uid,uid,uid,bytes.length,STORAGE_LIMIT).run();
      const reserved=await env.DB.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').bind(uid,hash).first();if(!reserved||reserved.size!==bytes.length)fail('Attachment storage is full (20 MiB), or combined book and attachment storage exceeds 100 MiB.',413);
      await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
      return json({ok:true});
    }
  }
  fail('Not found.',404);
}
export default {
  async scheduled(controller,env){await cleanupGoogleTasks(env);await cleanupBooks(env);await cleanupArticles(env);await cleanupOAuth(env).catch(()=>{});if(env.AI)await env.DB.prepare('DELETE FROM ai_requests WHERE created_at<?').bind(Date.now()-7*86400000).run();},
  async fetch(request,env,ctx){
    const project=env.FIREBASE_PROJECT_ID,allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!project||project.startsWith('REPLACE_')||!allowed.length)return json({error:'Environment is not configured.'},503);
    const origin=request.headers.get('Origin'),path=new URL(request.url).pathname,openOAuth=path.startsWith('/.well-known/oauth-')||['/oauth/register','/oauth/token'].includes(path);
    // OAuth discovery, registration and token endpoints are public and credential-free (PKCE); any app may call them.
    if(origin&&!allowed.includes(origin)&&!openOAuth)return json({error:'Origin not allowed.'},403);
    let response;try{response=await route(request,env,undefined,ctx);}catch(error){const status=error.status||500;response=json({error:status===500?'Cloud sync is temporarily unavailable.':error.message,...(['WORKDAYS_CONTEXT_REQUIRED','SYNC_VALIDATION_FAILED'].includes(error.code)?{code:error.code}:{})},status);if(status===500)console.error(JSON.stringify({event:'sync_error',message:String(error)}));}
    const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('Vary','Origin');if(origin)headers.set('Access-Control-Allow-Origin',openOAuth&&!allowed.includes(origin)?'*':origin);headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, If-None-Match, X-Sync-Vector, X-Remo-Capabilities');headers.set('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Protocol-Version');headers.set('Access-Control-Allow-Methods','GET, PUT, POST, DELETE, OPTIONS');headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  }
};
