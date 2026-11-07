/* OAuth 2.1 for connected AI apps (MCP authorization, 2025-06-18).
   This Worker is both the MCP resource server and its authorization server:
   - discovery: /.well-known/oauth-protected-resource and /.well-known/oauth-authorization-server
   - dynamic client registration: POST /oauth/register (public clients, PKCE S256 only)
   - authorize: GET /oauth/authorize validates the request and sends the owner to the RemoNook app,
     which signs them in with Firebase and shows a consent screen (GET/POST /oauth/requests/:id)
   - token: POST /oauth/token exchanges the code (single use, PKCE) and rotates refresh tokens.
   Access tokens are rows in mcp_tokens (hash only, 1 hour); each approval is a grant in mcp_grants
   that the owner sees and can disconnect in Settings → AI apps. */
const fail=(message,status=400,extra={})=>{throw Object.assign(Error(message),{status,...extra});};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=(n=24)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
export const OAUTH_SCOPES=['read','write','delete'];
const ACCESS_TTL=3600_000,REFRESH_TTL=30*86400_000,CODE_TTL=5*60_000,REQUEST_TTL=10*60_000;
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const oauthError=(error,description,status=400)=>json({error,error_description:description},status);
const origin=request=>new URL(request.url).origin;
/** The RemoNook app for this environment: the first allowed origin (production remonook.com, staging its own). */
const appOrigin=env=>(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).find(s=>/^https:\/\//.test(s))||(env.ALLOWED_ORIGINS||'').split(',')[0]?.trim();
export const resourceMetadataUrl=request=>origin(request)+'/.well-known/oauth-protected-resource';
const normalizeScopes=value=>{const asked=String(value||'').split(/[\s,]+/).filter(Boolean),set=new Set(asked.filter(s=>OAUTH_SCOPES.includes(s)));if(!set.size){set.add('read');set.add('write');}set.add('read');if(set.has('delete'))set.add('write');return OAUTH_SCOPES.filter(s=>set.has(s));};
const validRedirect=u=>{try{const x=new URL(u);if(x.hash)return false;if(x.protocol==='https:')return true;return x.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(x.hostname);}catch{return false;}};

/** Public OAuth routes (no Firebase session). Returns null for paths it does not own. */
export async function oauthPublic(request,env,{readLimited}){
 const url=new URL(request.url),o=origin(request);
 if(request.method==='GET'&&(url.pathname==='/.well-known/oauth-protected-resource'||url.pathname==='/.well-known/oauth-protected-resource/mcp'))
  return json({resource:o+'/mcp',authorization_servers:[o],scopes_supported:OAUTH_SCOPES,bearer_methods_supported:['header'],resource_name:'RemoNook'});
 if(request.method==='GET'&&(url.pathname==='/.well-known/oauth-authorization-server'||url.pathname==='/.well-known/openid-configuration'))
  return json({issuer:o,authorization_endpoint:o+'/oauth/authorize',token_endpoint:o+'/oauth/token',registration_endpoint:o+'/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:OAUTH_SCOPES});
 if(url.pathname==='/oauth/register'&&request.method==='POST'){
  let body;try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));}catch{return oauthError('invalid_client_metadata','Send JSON client metadata.');}
  const uris=Array.isArray(body?.redirect_uris)?body.redirect_uris.filter(u=>typeof u==='string'):[];
  if(!uris.length||uris.length>10||!uris.every(validRedirect))return oauthError('invalid_redirect_uri','Give 1–10 https redirect URIs (http only for localhost).');
  if(body.token_endpoint_auth_method&&body.token_endpoint_auth_method!=='none')return oauthError('invalid_client_metadata','Only public clients (token_endpoint_auth_method "none") with PKCE are supported.');
  const name=String(body.client_name||'AI app').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,80)||'AI app',id='rnc_'+random(12),now=Date.now();
  await env.DB.prepare('INSERT INTO oauth_clients(client_id,name,redirect_uris,created_at) VALUES(?,?,?,?)').bind(id,name,JSON.stringify(uris),now).run();
  return json({client_id:id,client_name:name,redirect_uris:uris,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',client_id_issued_at:Math.floor(now/1000)},201);
 }
 if(url.pathname==='/oauth/authorize'&&request.method==='GET'){
  const p=url.searchParams,clientId=p.get('client_id')||'',redirect=p.get('redirect_uri')||'',state=p.get('state')||'';
  const client=clientId&&await env.DB.prepare('SELECT * FROM oauth_clients WHERE client_id=?').bind(clientId).first();
  if(!client)return htmlError('This app is not registered with RemoNook. Reconnect it from the AI app.');
  const uris=JSON.parse(client.redirect_uris);
  if(!uris.includes(redirect))return htmlError('This sign-in link does not match the app’s registered address.');
  const back=(params)=>{const u=new URL(redirect);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);if(state)u.searchParams.set('state',state);u.searchParams.set('iss',o);return Response.redirect(u.toString(),302);};
  if(p.get('response_type')!=='code')return back({error:'unsupported_response_type'});
  const challenge=p.get('code_challenge')||'';
  if(p.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43,128}$/.test(challenge))return back({error:'invalid_request',error_description:'PKCE with S256 is required.'});
  const resource=p.get('resource');if(resource&&resource.replace(/\/$/,'')!==o+'/mcp'&&resource.replace(/\/$/,'')!==o)return back({error:'invalid_target'});
  const id=random(16),now=Date.now();
  await env.DB.prepare('INSERT INTO oauth_requests(id,client_id,redirect_uri,code_challenge,state,scopes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,clientId,redirect,challenge,state.slice(0,1000),normalizeScopes(p.get('scope')).join(' '),now,now+REQUEST_TTL).run();
  const app=appOrigin(env);if(!app)return htmlError('RemoNook is not configured for sign-in.');
  return Response.redirect(`${app}/?connect=${id}#app`,302);
 }
 if(url.pathname==='/oauth/token'&&request.method==='POST'){
  let form;try{const text=new TextDecoder().decode(await readLimited(request,8192));form=(request.headers.get('Content-Type')||'').includes('application/json')?new URLSearchParams(Object.entries(JSON.parse(text)).map(([k,v])=>[k,String(v)])):new URLSearchParams(text);}catch{return oauthError('invalid_request','Unreadable token request.');}
  const grant=form.get('grant_type'),clientId=form.get('client_id')||'';
  if(grant==='authorization_code'){
   const code=form.get('code')||'',verifier=form.get('code_verifier')||'';
   if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))return oauthError('invalid_grant','A PKCE code_verifier is required.');
   const row=await env.DB.prepare('SELECT * FROM oauth_codes WHERE hash=?').bind(await sha(code)).first();
   if(!row||row.used_at||row.expires_at<Date.now()||row.client_id!==clientId||row.redirect_uri!==(form.get('redirect_uri')||''))return oauthError('invalid_grant','The code is invalid, expired or already used.');
   const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   const used=await env.DB.prepare('UPDATE oauth_codes SET used_at=? WHERE hash=? AND used_at IS NULL').bind(Date.now(),row.hash).run();
   if(!used?.meta?.changes)return oauthError('invalid_grant','The code was already used.');
   if(challenge!==row.code_challenge)return oauthError('invalid_grant','PKCE verification failed.');
   return json(await issueTokens(env,row.grant_id));
  }
  if(grant==='refresh_token'){
   const refresh=form.get('refresh_token')||'',g=await env.DB.prepare('SELECT * FROM mcp_grants WHERE refresh_hash=?').bind(await sha(refresh)).first();
   if(!g||g.revoked_at||g.refresh_expires_at<Date.now()||(clientId&&g.client_id!==clientId))return oauthError('invalid_grant','The refresh token is invalid or was disconnected. Reconnect RemoNook.');
   return json(await issueTokens(env,g.id,g.refresh_hash));
  }
  return oauthError('unsupported_grant_type','Use authorization_code or refresh_token.');
 }
 return null;
}
/** A new access token for a grant plus a rotated refresh token (the previous one stops working). */
async function issueTokens(env,grantId,previousRefreshHash=null){
 const g=await env.DB.prepare('SELECT * FROM mcp_grants WHERE id=?').bind(grantId).first();
 if(!g||g.revoked_at)fail('This connection was disconnected.',400);
 const now=Date.now(),id=random(8),secret=random(24),refresh='rnr_'+random(32),refreshHash=await sha(refresh);
 const rotated=await env.DB.prepare('UPDATE mcp_grants SET refresh_hash=?,refresh_expires_at=?,last_used_at=? WHERE id=? AND revoked_at IS NULL AND (? IS NULL OR refresh_hash=?)').bind(refreshHash,now+REFRESH_TTL,now,grantId,previousRefreshHash,previousRefreshHash).run();
 if(!rotated?.meta?.changes)fail('The refresh token was already used.',400);
 await env.DB.batch([
  env.DB.prepare('UPDATE mcp_tokens SET revoked_at=? WHERE grant_id=? AND revoked_at IS NULL AND expires_at<?').bind(now,grantId,now),
  env.DB.prepare('INSERT INTO mcp_tokens(id,uid,name,secret_hash,scopes,created_at,expires_at,grant_id) VALUES(?,?,?,?,?,?,?,?)').bind(id,g.uid,g.name,await sha(secret),g.scopes,now,now+ACCESS_TTL,grantId),
 ]);
 return {access_token:`rnk_${id}_${secret}`,token_type:'Bearer',expires_in:ACCESS_TTL/1000,refresh_token:refresh,scope:g.scopes.split(',').join(' ')};
}
function htmlError(message){
 const safe=message.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RemoNook</title><body style="font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.3rem">Can’t connect to RemoNook</h1><p>${safe}</p></body>`,{status:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

/** Consent routes, signed in with the owner's Firebase session (from the RemoNook app). */
export async function oauthConsent(request,env,uid,{readLimited}){
 const m=new URL(request.url).pathname.match(/^\/oauth\/requests\/([a-f0-9]{32})(\/approve|\/deny)?$/);if(!m)return null;
 const r=await env.DB.prepare('SELECT q.*,c.name AS client_name FROM oauth_requests q JOIN oauth_clients c ON c.client_id=q.client_id WHERE q.id=?').bind(m[1]).first();
 if(!r||r.expires_at<Date.now())fail('This connection request expired. Start again from the AI app.',404);
 const back=params=>{const u=new URL(r.redirect_uri);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);if(r.state)u.searchParams.set('state',r.state);u.searchParams.set('iss',new URL(request.url).origin);return u.toString();};
 if(request.method==='GET'&&!m[2])return json({app:r.client_name,redirect_host:new URL(r.redirect_uri).host,scopes:r.scopes.split(' ')});
 if(request.method!=='POST')fail('Method not allowed',405);
 await env.DB.prepare('DELETE FROM oauth_requests WHERE id=?').bind(r.id).run();
 if(m[2]==='/deny')return json({redirect:back({error:'access_denied'})});
 let body={};try{body=JSON.parse(new TextDecoder().decode(await readLimited(request,2048))||'{}');}catch{}
 const scopes=normalizeScopes((Array.isArray(body.scopes)?body.scopes:r.scopes.split(' ')).join(' '));
 const active=await env.DB.prepare('SELECT COUNT(*) AS n FROM mcp_grants WHERE uid=? AND revoked_at IS NULL').bind(uid).first();
 if((active?.n||0)>=20)fail('You have 20 connected AI apps. Disconnect one in Settings → AI apps first.',409);
 const grantId=random(8),code=random(32),now=Date.now();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO mcp_grants(id,uid,client_id,name,scopes,refresh_hash,refresh_expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(grantId,uid,r.client_id,r.client_name,scopes.join(','),null,0,now),
  env.DB.prepare('INSERT INTO oauth_codes(hash,uid,client_id,redirect_uri,code_challenge,grant_id,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await sha(code),uid,r.client_id,r.redirect_uri,r.code_challenge,grantId,now+CODE_TTL),
 ]);
 return json({redirect:back({code})});
}
/** Housekeeping for the hourly cron: expired requests, codes and access tokens. */
export async function cleanupOAuth(env){
 const now=Date.now();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM oauth_requests WHERE expires_at<?').bind(now),
  env.DB.prepare('DELETE FROM oauth_codes WHERE expires_at<?').bind(now-86400_000),
  env.DB.prepare('DELETE FROM mcp_tokens WHERE grant_id IS NOT NULL AND expires_at<?').bind(now-86400_000),
 ]);
}
