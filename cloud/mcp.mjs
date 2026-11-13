import {commitServerChange,readServerDocument} from './sync-v2.mjs';
import {isV3Account,readSubsetV3} from './sync-v3.mjs';
import {TOOLS,INSTRUCTIONS,readTool,applyTool} from '../src/mcp-tools.mjs';
export {TOOLS,applyTool,animateShortcodes} from '../src/mcp-tools.mjs';

/* RemoNook MCP server (Streamable HTTP, JSON responses). AI apps authenticate with a personal access token
   created in Settings → AI apps; each token carries scopes: read, write, delete. Every write goes through
   commitServerChange: the same validation, compare-and-swap commit and sync journal as a device. */
export const MCP_VERSION='2025-06-18',SUPPORTED_VERSIONS=['2025-06-18','2025-03-26','2024-11-05'];
const LIMITS={create:500,delete:200,read:400,perMinute:60,tokens:10};
const fail=(message,status=400,extra={})=>{throw Object.assign(Error(message),{status,...extra});};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const SCOPES=['read','write','delete'];

/* ---------- Tokens (managed from the app, signed in with Firebase) ---------- */
export async function mcpManage(request,env,uid,{readLimited}){
 const url=new URL(request.url),json=b=>Response.json(b);
 if(url.pathname==='/mcp/tokens'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,name,scopes,created_at,last_used_at FROM mcp_tokens WHERE uid=? AND revoked_at IS NULL AND grant_id IS NULL ORDER BY created_at DESC').bind(uid).all();
  const grants=await env.DB.prepare('SELECT id,name,scopes,created_at,last_used_at FROM mcp_grants WHERE uid=? AND revoked_at IS NULL AND refresh_hash IS NOT NULL ORDER BY created_at DESC').bind(uid).all();
  return json({tokens:[...(grants.results||[]).map(r=>({...r,kind:'oauth',scopes:r.scopes.split(',')})),...(rows.results||[]).map(r=>({...r,kind:'token',scopes:r.scopes.split(',')}))]});
 }
 if(url.pathname==='/mcp/tokens'&&request.method==='POST'){
  let body;try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,4096)));}catch{fail('Invalid request.');}
  const name=String(body?.name||'').trim().slice(0,60)||'AI app',scopes=[...new Set(Array.isArray(body?.scopes)?body.scopes:['read'])];
  if(!scopes.includes('read')||scopes.some(s=>!SCOPES.includes(s))||(scopes.includes('delete')&&!scopes.includes('write')))fail('Choose read, read and write, or read, write and delete.');
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM mcp_tokens WHERE uid=? AND revoked_at IS NULL AND grant_id IS NULL').bind(uid).first();
  if((count?.n||0)>=LIMITS.tokens)fail(`You can connect up to ${LIMITS.tokens} AI apps. Disconnect one first.`,409);
  const id=crypto.randomUUID().replace(/-/g,'').slice(0,16),secret=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('INSERT INTO mcp_tokens(id,uid,name,secret_hash,scopes,created_at) VALUES(?,?,?,?,?,?)').bind(id,uid,name,await sha(secret),scopes.join(','),Date.now()).run();
  return json({id,name,scopes,token:`rnk_${id}_${secret}`});
 }
 const revoke=url.pathname.match(/^\/mcp\/tokens\/([a-f0-9]{16})$/);
 if(revoke&&request.method==='DELETE'){
  const now=Date.now();
  await env.DB.batch([
   env.DB.prepare('UPDATE mcp_tokens SET revoked_at=? WHERE id=? AND uid=? AND revoked_at IS NULL').bind(now,revoke[1],uid),
   // A connection made by signing in: disconnect it and every access token it issued.
   env.DB.prepare('UPDATE mcp_grants SET revoked_at=?,refresh_hash=NULL WHERE id=? AND uid=? AND revoked_at IS NULL').bind(now,revoke[1],uid),
   env.DB.prepare('UPDATE mcp_tokens SET revoked_at=? WHERE grant_id=? AND uid=? AND revoked_at IS NULL').bind(now,revoke[1],uid),
  ]);
  return json({ok:true});
 }
 if(url.pathname==='/mcp/activity'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT a.id,a.tool,a.summary,a.ids,a.created_at,t.name AS app FROM mcp_activity a LEFT JOIN mcp_tokens t ON t.id=a.token_id WHERE a.uid=? ORDER BY a.created_at DESC LIMIT 50').bind(uid).all();
  return json({activity:(rows.results||[]).map(r=>({...r,ids:JSON.parse(r.ids||'[]')}))});
 }
 fail('Not found.',404);
}
async function tokenUser(request,env){
 const m=(request.headers.get('Authorization')||'').match(/^Bearer rnk_([a-f0-9]{16})_([a-f0-9]{48})$/);
 if(!m)fail('Connect this app with a RemoNook access token from Settings → AI apps.',401);
 const row=await env.DB.prepare('SELECT * FROM mcp_tokens WHERE id=?').bind(m[1]).first();
 if(!row||row.revoked_at||row.secret_hash!==await sha(m[2]))fail('This access token was disconnected or is not valid. Create a new one in Settings → AI apps.',401);
 if(row.expires_at&&row.expires_at<Date.now())fail('The access token expired. Refresh it.',401);
 if(row.grant_id){const g=await env.DB.prepare('SELECT revoked_at FROM mcp_grants WHERE id=?').bind(row.grant_id).first();if(!g||g.revoked_at)fail('This app was disconnected in Settings → AI apps.',401);await env.DB.prepare('UPDATE mcp_grants SET last_used_at=? WHERE id=?').bind(Date.now(),row.grant_id).run();}
 const now=Date.now(),minute=Math.floor(now/60000)*60000;
 const updated=await env.DB.prepare('UPDATE mcp_tokens SET last_used_at=?,window_start=?,window_count=CASE WHEN window_start=? THEN window_count+1 ELSE 1 END WHERE id=? AND (window_start!=? OR window_count<?)').bind(now,minute,minute,row.id,minute,LIMITS.perMinute).run();
 if(!updated?.meta?.changes)fail('Too many requests from this app. Wait a minute and try again.',429);
 return {uid:row.uid,tokenId:row.id,scopes:new Set(row.scopes.split(','))};
}

/* ---------- Tools ---------- */
const clampInt=(v,min,max,def)=>Number.isInteger(v)?Math.max(min,Math.min(max,v)):def;

/** The longest plain word of a simple search (ASCII letters and digits, no operators), which
 every hit must contain; null when the query needs the whole outline (fields, OR, non-ASCII). */
export function searchWord(query){
 const q=String(query||'').trim();
 if(!q||!/^[A-Za-z0-9#@_\/\s-]+$/.test(q)||/(^|\s)or(\s|$)/i.test(q))return null;
 const words=q.split(/\s+/).filter(w=>!w.startsWith('-')).map(w=>w.replace(/^[#@]+/,'')).filter(w=>w.length>=2);
 return words.sort((a,b)=>b.length-a.length)[0]||null;
}
/** Sync v3 accounts read only the part of the outline a read tool needs. */
async function readForTool(env,uid,name,args){
 if(await isV3Account(env,uid)){
  if(name==='search'){const word=searchWord(args.query);if(word)return readSubsetV3(env,uid,{word});}
  if(name==='list_pages')return readSubsetV3(env,uid,{parent:args.parent_id||null});
  if(name==='read_page'&&args.id)return readSubsetV3(env,uid,{root:args.id});
 }
 return readServerDocument(env,uid);
}
/** Runs one tool. Reads use the stored document; writes go through commitServerChange. */
export async function callTool(env,auth,name,args,deps){
 const tool=TOOLS.find(t=>t.name===name);if(!tool)fail(`Unknown tool ${name}.`,404);
 if(!auth.scopes.has(tool.scope))fail(tool.scope==='delete'?'This app may not delete notes. Allow deleting in Settings → AI apps.':'This app has read-only access. Allow editing in Settings → AI apps.',403);
 args=args&&typeof args==='object'?args:{};
 if(tool.scope==='read'){
  if(name==='recent_changes'){const rows=await env.DB.prepare('SELECT tool,summary,ids,created_at FROM mcp_activity WHERE uid=? ORDER BY created_at DESC LIMIT ?').bind(auth.uid,clampInt(args.limit,1,50,20)).all();return {text:(rows.results||[]).map(r=>`- ${new Date(r.created_at).toISOString()} ${r.tool}: ${r.summary} ${r.ids}`).join('\n')||'No changes from AI apps yet.'};}
  const {doc,revision,childCounts}=await readForTool(env,auth.uid,name,args);
  return readTool(doc,name,args,{revision,childCounts});
 }
 // Writes: a stable operation id makes retries with the same idempotency key safe.
 const keyText=typeof args.idempotency_key==='string'&&args.idempotency_key?args.idempotency_key.slice(0,200):crypto.randomUUID();
 const opHash=await sha(`mcp:${auth.tokenId}:${keyText}`),operationId=`${opHash.slice(0,8)}-${opHash.slice(8,12)}-${opHash.slice(12,16)}-${opHash.slice(16,20)}-${opHash.slice(20,32)}`;
 const requestHash=await sha(JSON.stringify([name,{...args,idempotency_key:undefined}]));
 const committed=await commitServerChange(env,auth.uid,{operationId,requestHash,change:doc=>applyTool(doc,name,args)},deps);
 if(committed.replayed)return {text:'Already applied (same idempotency key). Nothing changed.',structured:{revision:committed.revision}};
 const r=committed.result||{summary:'No change.',ids:[]};
 if(!committed.unchanged)await env.DB.prepare('INSERT INTO mcp_activity(uid,id,token_id,tool,summary,ids,revision,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(auth.uid,crypto.randomUUID(),auth.tokenId,name,r.summary,JSON.stringify(r.ids.slice(0,200)),committed.revision,Date.now()).run();
 return {text:r.text||r.summary,structured:{revision:committed.revision,ids:r.ids}};
}

/* ---------- JSON-RPC over HTTP ---------- */
export async function mcpEndpoint(request,env,deps){
 if(request.method==='GET'||request.method==='DELETE')return new Response(null,{status:405,headers:{Allow:'POST'}});
 if(request.method!=='POST')fail('Method not allowed',405);
 let auth;try{auth=await tokenUser(request,env);}catch(e){return new Response(JSON.stringify({error:e.message}),{status:e.status||401,headers:{'Content-Type':'application/json','WWW-Authenticate':`Bearer realm="RemoNook", error="invalid_token", resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource"`}});}
 let message;try{message=JSON.parse(new TextDecoder().decode(await deps.readLimited(request,512*1024)));}catch(e){if(e.status)throw e;return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
 const batch=Array.isArray(message),replies=[];
 for(const m of batch?message.slice(0,20):[message]){const reply=await handle(env,auth,m,deps);if(reply)replies.push(reply);}
 if(!replies.length)return new Response(null,{status:202});
 return Response.json(batch?replies:replies[0],{headers:{'MCP-Protocol-Version':MCP_VERSION}});
}
async function handle(env,auth,m,deps){
 if(!m||m.jsonrpc!=='2.0'||typeof m.method!=='string')return {jsonrpc:'2.0',id:m?.id??null,error:{code:-32600,message:'Invalid request'}};
 if(m.id===undefined||m.id===null)return null; // notifications (initialized, cancelled) need no reply
 const ok=result=>({jsonrpc:'2.0',id:m.id,result});
 try{
  if(m.method==='initialize'){const asked=m.params?.protocolVersion;return ok({protocolVersion:SUPPORTED_VERSIONS.includes(asked)?asked:MCP_VERSION,capabilities:{tools:{listChanged:false}},serverInfo:{name:'RemoNook',version:'1.0.0'},instructions:INSTRUCTIONS});}
  if(m.method==='ping')return ok({});
  if(m.method==='tools/list')return ok({tools:TOOLS.filter(t=>auth.scopes.has(t.scope)).map(({scope,...t})=>({...t,annotations:{readOnlyHint:scope==='read',destructiveHint:scope==='delete',idempotentHint:scope==='read'}}))});
  if(m.method==='tools/call'){
   try{const r=await callTool(env,auth,m.params?.name,m.params?.arguments,deps);return ok({content:[{type:'text',text:r.text}],...(r.structured?{structuredContent:r.structured}:{})});}
   catch(e){if(e.status&&e.status<500||e.code==='UNSUPPORTED_MARKDOWN')return ok({content:[{type:'text',text:e.message}],isError:true});console.error(JSON.stringify({event:'mcp_tool_error',tool:m.params?.name,message:String(e)}));return ok({content:[{type:'text',text:'RemoNook could not complete this. Nothing was changed. Try again shortly.'}],isError:true});}
  }
  return {jsonrpc:'2.0',id:m.id,error:{code:-32601,message:`Method not found: ${m.method}`}};
 }catch(e){return {jsonrpc:'2.0',id:m.id,error:{code:-32603,message:e.status?e.message:'Internal error'}};}
}
