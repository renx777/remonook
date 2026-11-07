import {commitServerChange,readServerDocument} from './sync-v2.mjs';
import {bullet,index,move,descendants} from '../src/domain.mjs';
import {withNodes} from '../src/workspace-nodes.mjs';
import {parseMarkdown,parseInline,itemsToBullets,outlineMarkdown,bulletVersion,bulletMarkdown} from '../src/ai-markdown.mjs';
import {displayText,notePath} from '../src/relations.mjs';
import {searchMatcher} from '../src/search.mjs';
import {configureMcq} from '../src/mcq.mjs';
import {addBookmark,patchBookmark,bookmarkNote,bookmarkUrl} from '../src/bookmarks.mjs';
import {notoEmojis,getNotoEmoji} from '../src/noto-emojis.mjs';

/* Animated emoji: AI apps write shortcodes (:rocket:, :party_popper:, :tada:). They become RemoNook's Google Noto
   tokens, and the emoji joins the workspace library; each device then fetches the animation itself (the app's
   catalog repair). Code blocks and inline code are left alone; unknown shortcodes stay as text. */
const ALIASES={tada:'party-popper',thumbsup:'thumbs-up','+1':'thumbs-up',joy:'joy',heart_eyes:'heart-eyes',sob:'loudly-crying',eyes:'eyes',star:'star',white_check_mark:'check-mark',heavy_check_mark:'check-mark',x:'cross-mark',warning:'warning',bulb:'light-bulb',memo:'memo',books:'books',pray:'folded-hands',clap:'clapping-hands',muscle:'muscle',wave:'wave'};
const SHORTCODES=new Map();for(const e of notoEmojis)for(const t of e.tags||[]){const k=t.slice(1,-1).toLowerCase();if(!SHORTCODES.has(k))SHORTCODES.set(k,e.token);}
const shortcode=name=>{const k=name.toLowerCase().replace(/_/g,'-');return SHORTCODES.get(k)||SHORTCODES.get((ALIASES[name.toLowerCase()]||'').replace(/_/g,'-'))||null;};
export function animateShortcodes(md){
 if(typeof md!=='string'||!md.includes(':'))return md;
 return md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/).map((part,i)=>i%2?part:part.replace(/:([a-z0-9][a-z0-9_+-]{0,40}):/gi,(m,name)=>shortcode(name)||m)).join('');
}
function registerEmojis(doc){
 const have=new Set((doc.tables.emojis||[]).map(e=>e.token)),add=[];
 for(const n of doc.tables.bullets){if(n.codeLanguage||!n.text.includes(':noto_'))continue;for(const m of n.text.matchAll(/:noto_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:/g)){const e=getNotoEmoji(m[0]);if(e&&!have.has(e.token)){have.add(e.token);add.push({token:e.token,fileName:e.fileName,label:e.label});}}}
 return add.length?{...doc,tables:{...doc.tables,emojis:[...(doc.tables.emojis||[]),...add]}}:doc;
}
const withEmojiArgs=args=>({...args,
 ...(typeof args.markdown==='string'?{markdown:animateShortcodes(args.markdown)}:{}),
 ...(Array.isArray(args.cards)?{cards:args.cards.map(c=>({...c,question:animateShortcodes(c?.question),answer:animateShortcodes(c?.answer)}))}:{}),
 ...(Array.isArray(args.questions)?{questions:args.questions.map(q=>({...q,question:animateShortcodes(q?.question),options:Array.isArray(q?.options)?q.options.map(animateShortcodes):q?.options,explanation:animateShortcodes(q?.explanation)}))}:{}),
});

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
const S=(props,required=[])=>({type:'object',properties:props,required,additionalProperties:false});
const str=d=>({type:'string',description:d}),int=d=>({type:'integer',description:d}),ids=d=>({type:'array',items:{type:'string'},description:d});
const key={idempotency_key:str('Optional. Reuse the same key when retrying a call so it is applied only once.')};
export const TOOLS=[
 {name:'search',scope:'read',description:'Find bullets. Plain words match text; #tag matches a tag and its sub-tags; filters such as is:todo, date:today, has:children work too. Returns matching bullets with ids, versions and their page path.',inputSchema:S({query:str('What to look for.'),limit:int('Maximum results, 1–50 (default 20).')},['query'])},
 {name:'list_pages',scope:'read',description:'List the bullets directly under a parent (the top level when parent_id is omitted), with ids, child counts and kinds. Use it to find where to read or write.',inputSchema:S({parent_id:str('A bullet id, or omit for the top level.')})},
 {name:'read_page',scope:'read',description:'Read a bullet and everything under it (or the whole outline) as nested Markdown. Each line ends with <!-- id=… v=… -->: the id and version you need to edit it. Long pages are paginated with offset.',inputSchema:S({id:str('The bullet to read; omit for the whole outline.'),offset:int('Bullets to skip, from next_offset of the previous call.'),max_bullets:int('Up to 400 (default 200).')})},
 {name:'write_notes',scope:'write',description:'Add notes from Markdown under a parent bullet. Nested lists become nested bullets; # headings nest what follows them; - [ ] / - [x] are tasks; ```lang code, ```mermaid diagrams and | tables | become their RemoNook blocks; --- is a divider. Inline: **bold**, *italic*, `code`, ==highlight==, <u>underline</u>, #tags, [[Title|id]] links. Colours: <mark color="green">highlight</mark> (yellow, lemon, amber, orange, peach, coral, pink, rose, magenta, lavender, violet, indigo, blue, sky, cyan, teal, mint, green, lime, sage, sand, brown, gray); text colour <mark data-style="COLOR_red">text</mark> (black, gray, brown, red, coral, orange, amber, yellow, lemon, lime, green, mint, teal, cyan, sky, blue, indigo, violet, purple, magenta, pink, rose, slate); hand-drawn marks <mark data-style="ROUGH_CIRCLE_red">, ROUGH_BOX_…, ROUGH_UNDERLINE_…, ROUGH_HIGHLIGHT_… (colour name or AUTO); hidden-until-revealed text for study <mark data-style="MASK">answer</mark>. Hex colours also work. Marks can nest. Animated emoji: write a shortcode such as :rocket:, :fire:, :sparkles:, :brain:, :party_popper: (Google Noto names); it becomes a RemoNook animated emoji. Plain emoji characters stay static. Strikethrough is not supported.',inputSchema:S({parent_id:str('Where to add them; omit for the top level.'),position:int('Index among the existing children (default: at the end).'),markdown:str('The notes.'),...key},['markdown'])},
 {name:'update_note',scope:'write',description:'Change one bullet. Pass the version from read_page or search; if the bullet changed since, the edit is refused and you must read it again. markdown replaces its content (one bullet: inline Markdown, optionally starting with [ ] or [x], or a single code block / mermaid block / table). It accepts the same formatting as write_notes, including <mark color="…"> highlights and <mark data-style="COLOR_…"> text colours, so you can recolour or highlight existing text. Keep any <mark data-style=…> parts you are not changing, so formatting is kept.',inputSchema:S({id:str('The bullet.'),version:str('The v= value you read.'),markdown:str('New content for this bullet only (not its children).'),mindmap:{type:'boolean',description:'Show this branch as a mindmap.'},collapsed:{type:'boolean',description:'Fold its children.'},due_date:str('YYYY-MM-DD, or an empty string to clear.'),...key},['id','version'])},
 {name:'move_notes',scope:'write',description:'Move bullets (with their children) under a new parent, keeping their order.',inputSchema:S({ids:ids('Bullets to move.'),parent_id:{type:['string','null'],description:'New parent id, or null for the top level.'},position:int('Index among the new parent\'s children (default: at the end).'),...key},['ids','parent_id'])},
 {name:'delete_notes',scope:'delete',description:'Move bullets and everything under them to RemoNook\'s Trash, where the owner can restore them. Up to 200 bullets per call.',inputSchema:S({ids:ids('Bullets to delete.'),...key},['ids'])},
 {name:'create_flashcards',scope:'write',description:'Create flashcards for Study Desk under a parent bullet. Each card is a question bullet with its answer underneath (answer may be Markdown, including lists).',inputSchema:S({parent_id:str('Where to add them; omit for the top level.'),cards:{type:'array',items:S({question:str('Front of the card.'),answer:str('Back of the card.')},['question','answer']),description:'Up to 100 cards.'},...key},['cards'])},
 {name:'create_mcqs',scope:'write',description:'Create multiple-choice questions for Study Desk. Each has exactly four options and one correct answer.',inputSchema:S({parent_id:str('Where to add them; omit for the top level.'),questions:{type:'array',items:S({question:str('The question.'),options:{type:'array',items:{type:'string'},minItems:4,maxItems:4},correct_index:int('0–3: which option is right.'),explanation:str('Optional explanation shown after answering.')},['question','options','correct_index']),description:'Up to 50 questions.'},...key},['questions'])},
 {name:'add_bookmark',scope:'write',description:'Save a web page to Bookmarks, with optional title, tags and a note.',inputSchema:S({url:str('An http or https address.'),title:str('Optional title.'),tags:{type:'array',items:{type:'string'}},note:str('Optional note saved with it.'),...key},['url'])},
 {name:'recent_changes',scope:'read',description:'What connected AI apps changed recently (newest first): tool, summary, bullet ids and time.',inputSchema:S({limit:int('Up to 50 (default 20).')})},
];
const INSTRUCTIONS='RemoNook is an outliner: notes are nested bullets. Read with read_page/search before editing; every bullet line ends with <!-- id=… v=… -->. Edits must quote the version you read. Write new content with write_notes in Markdown. Deleted bullets go to Trash. Keep formatting written as <mark data-style="…">…</mark> unchanged unless asked.';

const clampInt=(v,min,max,def)=>Number.isInteger(v)?Math.max(min,Math.min(max,v)):def;
const need=(v,name)=>{if(typeof v!=='string'||!v.trim())fail(`${name} is required.`);return v;};
const live=(doc,id,what='Bullet')=>{const n=doc.tables.bullets.find(x=>x.id===id);if(!n)fail(`${what} ${id} was not found. It may have been deleted; search again.`,404);return n;};
const parentOf=(doc,id)=>{if(id===undefined||id===null||id==='')return null;const p=live(doc,id,'Parent');if(p.codeLanguage||p.blockStyle==='divider')fail('Notes cannot be added inside a code block or divider.');return p.mirrorSourceId||p.id;};
const titled=(idx,n)=>displayText(n.text).replace(/\s+/g,' ').slice(0,140)||'Untitled';
const pathOf=(doc,idx,n)=>notePath(doc.tables.bullets,n.parentId,idx)||'Top level';

/** Inserts new bullets under parent at position (default end), returning the updated nodes. */
function insertAt(nodes,created,parentId,position){
 let next=[...nodes,...created];const top=created.filter(n=>n.parentId===parentId),start=(index(nodes).children.get(parentId)||[]).length;
 if(Number.isInteger(position)&&position<start)top.forEach((n,i)=>{next=move(next,n.id,parentId,position+i);});
 else top.forEach((n,i)=>{next=next.map(x=>x.id===n.id?{...x,position:start+i}:x);});
 return next;
}
function contentFromMarkdown(md){
 const src=String(md);
 if(/^\s*(```|~~~|\|)/.test(src)||/^\s*-{3,}\s*$/.test(src)){const items=parseMarkdown(src);if(items.length!==1)fail('markdown must describe this one bullet. Use write_notes to add children.');return items[0];}
 const task=/^\s*\[([ xX])\]\s+/.exec(src),body=task?src.slice(task[0].length):src;
 return {...parseInline(body),taskState:task?task[1]===' '?'TODO':'DONE':'NONE'};
}
function trashEntry(doc,rootIds){
 const nodes=doc.tables.bullets,all=new Set();for(const id of rootIds)for(const d of descendants(nodes,id))all.add(d);
 const first=nodes.find(n=>n.id===rootIds[0]);
 return {all,entry:{id:crypto.randomUUID(),title:rootIds.length===1&&first?(first.text||'Empty bullet'):`${rootIds.length} bullets`,deletedAt:Date.now(),nodeCount:all.size,payload:JSON.stringify({nodes:nodes.filter(n=>all.has(n.id)),media:doc.tables.media.filter(m=>all.has(m.bulletId)),decks:doc.tables.decks.filter(d=>all.has(d.rootId))})}};
}

/** Runs one tool. Reads use the stored document; writes go through commitServerChange. */
export async function callTool(env,auth,name,args,deps){
 const tool=TOOLS.find(t=>t.name===name);if(!tool)fail(`Unknown tool ${name}.`,404);
 if(!auth.scopes.has(tool.scope))fail(tool.scope==='delete'?'This app may not delete notes. Allow deleting in Settings → AI apps.':'This app has read-only access. Allow editing in Settings → AI apps.',403);
 args=args&&typeof args==='object'?args:{};
 if(tool.scope==='read'){
  if(name==='recent_changes'){const rows=await env.DB.prepare('SELECT tool,summary,ids,created_at FROM mcp_activity WHERE uid=? ORDER BY created_at DESC LIMIT ?').bind(auth.uid,clampInt(args.limit,1,50,20)).all();return {text:(rows.results||[]).map(r=>`- ${new Date(r.created_at).toISOString()} ${r.tool}: ${r.summary} ${r.ids}`).join('\n')||'No changes from AI apps yet.'};}
  const {doc,revision}=await readServerDocument(env,auth.uid),idx=index(doc.tables.bullets);
  if(name==='search'){
   const q=need(args.query,'query').trim(),match=searchMatcher(doc.tables.bullets,doc.tables.media||[],doc.web.noteTimes||{}),limit=clampInt(args.limit,1,50,20),hits=[];
   for(const n of doc.tables.bullets){if(hits.length>=limit)break;if(match(n,q))hits.push(n);}
   return {text:hits.length?hits.map(n=>`- ${bulletMarkdown(n).split('\n')[0]} <!-- id=${n.id} v=${bulletVersion(n)} -->\n  in: ${pathOf(doc,idx,n)}`).join('\n'):`No bullets match "${q}".`,structured:{revision,count:hits.length}};
  }
  if(name==='list_pages'){
   const parent=args.parent_id?live(doc,args.parent_id).id:null,kids=idx.children.get(parent)||[];
   return {text:kids.length?kids.map(n=>`- ${titled(idx,n)} <!-- id=${n.id} children=${(idx.children.get(n.id)||[]).length}${n.kind!=='NOTE'?' kind='+n.kind:''}${n.mindmap?' mindmap':''} -->`).join('\n'):'No bullets here.',structured:{revision,count:kids.length}};
  }
  if(name==='read_page'){
   const root=args.id?live(doc,args.id):null,out=outlineMarkdown(idx,root?root.id:null,{offset:clampInt(args.offset,0,1e6,0),maxNodes:clampInt(args.max_bullets,1,LIMITS.read,200)});
   const head=root?`# ${titled(idx,root)} <!-- id=${root.id} v=${bulletVersion(root)} -->\nPath: ${pathOf(doc,idx,root)}\n\n`:'# All notes\n\n';
   return {text:head+(out.markdown||'(no bullets under it)')+(out.next_offset!==null?`\n\n…more: call read_page again with offset ${out.next_offset}.`:''),structured:{revision,count:out.count,next_offset:out.next_offset}};
  }
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

/** Pure workspace change for a write tool: returns {doc, result:{summary, ids, text}}. */
export function applyTool(doc,name,args){
 args=withEmojiArgs(args);
 const nodes=doc.tables.bullets,makeId=()=>crypto.randomUUID();
 const done=(next,summary,ids,text)=>({doc:registerEmojis(next),result:{summary,ids,text}});
 if(name==='write_notes'){
  const parent=parentOf(doc,args.parent_id),items=parseMarkdown(need(args.markdown,'markdown'));
  if(!items.length)fail('markdown has no content.');
  const created=itemsToBullets(items,parent,makeId,bullet),next=withNodes(doc,insertAt(nodes,created,parent,args.position));
  const idx=index(next.tables.bullets);
  return done(next,`Added ${created.length} bullet${created.length===1?'':'s'}`,created.map(n=>n.id),`Added ${created.length} bullet${created.length===1?'':'s'}:\n${created.filter(n=>n.parentId===parent).map(n=>`- ${titled(idx,n)} <!-- id=${n.id} -->`).join('\n')}`);
 }
 if(name==='update_note'){
  const n=live(doc,need(args.id,'id'));
  if(n.mirrorSourceId)fail(`This bullet mirrors ${n.mirrorSourceId}. Edit that one instead.`);
  if(args.version!==bulletVersion(n))fail('This bullet changed since you read it. Read it again with read_page, then retry with the new version.',409,{code:'VERSION_CONFLICT'});
  let patch={};
  if(args.markdown!==undefined){const c=contentFromMarkdown(args.markdown);patch={...patch,text:c.text,formatting:c.formatting,taskState:c.taskState??n.taskState,...(c.codeLanguage!==undefined?{codeLanguage:c.codeLanguage}:{}),...(c.blockStyle?{blockStyle:c.blockStyle}:{})};}
  if(typeof args.mindmap==='boolean')patch.mindmap=args.mindmap||undefined;
  if(typeof args.collapsed==='boolean')patch.collapsed=args.collapsed;
  if(typeof args.due_date==='string'){if(args.due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(args.due_date))fail('due_date must be YYYY-MM-DD.');patch.dueDate=args.due_date;}
  if(!Object.keys(patch).length)fail('Nothing to change: pass markdown, mindmap, collapsed or due_date.');
  const updated={...n,...patch};if(updated.mindmap===undefined)delete updated.mindmap;
  const next=withNodes(doc,nodes.map(x=>x.id===n.id?updated:x));
  return done(next,'Updated 1 bullet',[n.id],`Updated. New version: ${bulletVersion(next.tables.bullets.find(x=>x.id===n.id))}`);
 }
 if(name==='move_notes'){
  const list=[...new Set(Array.isArray(args.ids)?args.ids:[])];if(!list.length||list.length>LIMITS.delete)fail(`Pass 1–${LIMITS.delete} ids.`);
  const parent=args.parent_id===null?null:parentOf(doc,args.parent_id);let next=nodes,at=Number.isInteger(args.position)?args.position:Infinity;
  for(const id of list){live(doc,id);if(parent&&descendants(next,id).has(parent))fail('A bullet cannot move inside itself.');const count=(index(next).children.get(parent)||[]).filter(x=>x.id!==id).length;next=move(next,id,parent,Math.min(at,count));if(at!==Infinity)at++;}
  return done(withNodes(doc,next),`Moved ${list.length} bullet${list.length===1?'':'s'}`,list);
 }
 if(name==='delete_notes'){
  const list=[...new Set(Array.isArray(args.ids)?args.ids:[])].map(id=>{const n=live(doc,id);return n.mirrorSourceId&&n.mirrorRootId!==id?n.mirrorSourceId:id;});
  if(!list.length)fail('Pass the ids to delete.');
  const {all,entry}=trashEntry(doc,list);if(all.size>LIMITS.delete)fail(`That would delete ${all.size} bullets. Delete at most ${LIMITS.delete} per call (smaller branches first).`);
  const next=withNodes(doc,nodes.filter(n=>!all.has(n.id)));next.tables={...next.tables,trash:[...doc.tables.trash,entry]};
  return done(next,`Moved ${all.size} bullet${all.size===1?'':'s'} to Trash`,[...all],`Moved ${all.size} bullet${all.size===1?'':'s'} to Trash. The owner can restore them from Trash.`);
 }
 if(name==='create_flashcards'){
  const parent=parentOf(doc,args.parent_id),cards=Array.isArray(args.cards)?args.cards:[];if(!cards.length||cards.length>100)fail('Pass 1–100 cards.');
  const created=[];
  cards.forEach((c,i)=>{const q=parseInline(need(c?.question,`cards[${i}].question`)),qid=makeId();created.push(bullet(qid,{parentId:parent,position:i,text:q.text,formatting:q.formatting,kind:'QUESTION'}));created.push(...itemsToBullets(parseMarkdown(need(c?.answer,`cards[${i}].answer`)),qid,makeId,bullet));});
  if(created.length>LIMITS.create)fail(`At most ${LIMITS.create} bullets per call.`);
  const next=withNodes(doc,insertAt(nodes,created,parent,undefined));
  return done(next,`Created ${cards.length} flashcard${cards.length===1?'':'s'}`,created.filter(n=>n.kind==='QUESTION').map(n=>n.id));
 }
 if(name==='create_mcqs'){
  const parent=parentOf(doc,args.parent_id),qs=Array.isArray(args.questions)?args.questions:[];if(!qs.length||qs.length>50)fail('Pass 1–50 questions.');
  const created=[],plan=[];
  qs.forEach((q,i)=>{const opts=Array.isArray(q?.options)?q.options:[];if(opts.length!==4||opts.some(o=>typeof o!=='string'||!o.trim()))fail(`questions[${i}] needs exactly four non-empty options.`);if(!Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>3)fail(`questions[${i}].correct_index must be 0–3.`);
   const qt=parseInline(need(q.question,`questions[${i}].question`)),qid=makeId(),optionIds=opts.map(()=>makeId());created.push(bullet(qid,{parentId:parent,position:i,text:qt.text,formatting:qt.formatting}));
   opts.forEach((o,k)=>{const ot=parseInline(o);created.push(bullet(optionIds[k],{parentId:qid,position:k,text:ot.text,formatting:ot.formatting}));});plan.push({qid,correct:optionIds[q.correct_index],explanation:typeof q.explanation==='string'?q.explanation:''});});
  let next=withNodes(doc,insertAt(nodes,created,parent,undefined));for(const p of plan)next=configureMcq(next,p.qid,{correctOptionId:p.correct,explanation:p.explanation});next=withNodes(next,next.tables.bullets);
  return done(next,`Created ${qs.length} multiple-choice question${qs.length===1?'':'s'}`,plan.map(p=>p.qid));
 }
 if(name==='add_bookmark'){
  bookmarkUrl(need(args.url,'url'));let {doc:next,bookmark}=addBookmark(doc,args.url);
  const tags=Array.isArray(args.tags)?args.tags.filter(t=>typeof t==='string'&&t.trim()).map(t=>t.trim().replace(/^#/,'').slice(0,40)).slice(0,20):[];
  const patch={...(typeof args.title==='string'&&args.title.trim()?{title:args.title.trim().slice(0,300)}:{}),...(tags.length?{tags:[...new Set([...(bookmark.tags||[]),...tags])]}:{})};
  if(Object.keys(patch).length)next=patchBookmark(next,bookmark.id,patch);
  if(typeof args.note==='string'&&args.note.trim()){next=bookmarkNote(next,next.web.bookmarks[bookmark.id],args.note.trim().slice(0,5000));next=withNodes(next,next.tables.bullets);}
  return done(next,'Saved a bookmark',[bookmark.id],`Saved to Bookmarks (id ${bookmark.id}). The page text is captured the next time RemoNook opens it.`);
 }
 fail(`Unknown tool ${name}.`,404);
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
