import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import './ai-apps.css';

type Token={id:string;name:string;scopes:string[];created_at:number;last_used_at:number|null};
type Activity={id:string;tool:string;summary:string;created_at:number;app:string|null};
const ACCESS=[['read','Read only','Can search and read your notes.'],['write','Read and write','Can also add and edit notes, flashcards, MCQs and bookmarks.'],['delete','Read, write and delete','Can also move notes to Trash (you can restore them).']] as const;
const scopesFor=(a:string)=>a==='read'?['read']:a==='write'?['read','write']:['read','write','delete'];
const accessLabel=(s:string[])=>s.includes('delete')?'Read, write and delete':s.includes('write')?'Read and write':'Read only';
const when=(t:number|null)=>t?new Date(t).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Never';

/** Settings → AI apps: connect Claude, ChatGPT, Codex or any MCP client to these notes. */
export function AiApps({user}:{user:User|null}){
  const [tokens,setTokens]=useState<Token[]|null>(null),[activity,setActivity]=useState<Activity[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [name,setName]=useState('Claude'),[access,setAccess]=useState('write'),[created,setCreated]=useState<{token:string;name:string}|null>(null),[copied,setCopied]=useState('');
  const endpoint=CLOUD_API+'/mcp';
  const request=async(path:string,init:RequestInit={})=>{if(!user)throw Error('Sign in first.');const r=await fetch(CLOUD_API+path,{...init,headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},cache:'no-store'});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'RemoNook cloud is unavailable. Try again.');return v;};
  const load=async()=>{try{setError('');const [t,a]=await Promise.all([request('/mcp/tokens'),request('/mcp/activity')]);setTokens(t.tokens);setActivity(a.activity);}catch(e){setError(e instanceof Error?e.message:String(e));setTokens([]);}};
  useEffect(()=>{if(user)void load();},[user?.uid]);
  const copy=async(label:string,text:string)=>{try{await navigator.clipboard.writeText(text);setCopied(label);setTimeout(()=>setCopied(''),1600);}catch{setError('Copy failed. Select the text and copy it.');}};
  if(!user)return <section className="ai-apps" aria-label="AI apps"><div className="settings-section-heading"><h3>Use your notes from AI apps.</h3><p>Sign in to RemoNook cloud first. AI apps connect to your cloud notes, not to this device.</p></div></section>;
  const token=created?.token||'<your token>';
  const configs=[
    ['Claude Code',`claude mcp add --transport http remonook ${endpoint} --header "Authorization: Bearer ${token}"`],
    ['Codex',`# ~/.codex/config.toml\n[mcp_servers.remonook]\nurl = "${endpoint}"\nbearer_token_env_var = "REMONOOK_TOKEN"\n\n# then: export REMONOOK_TOKEN=${token}`],
    ['Claude Desktop',JSON.stringify({mcpServers:{remonook:{command:'npx',args:['-y','mcp-remote',endpoint,'--header','Authorization:${AUTH}'],env:{AUTH:`Bearer ${token}`}}}},null,2)],
    ['Any MCP client',`URL: ${endpoint}\nTransport: Streamable HTTP\nHeader: Authorization: Bearer ${token}`],
  ];
  return <section className="ai-apps" aria-label="AI apps">
    <div className="settings-section-heading"><h3>Use your notes from AI apps.</h3><p>Connect Claude, Codex, ChatGPT or any MCP app. Ask it to write notes, flashcards, MCQs, tables or diagrams straight into RemoNook, or to read and tidy what you have. Changes sync to all your devices; deleted notes go to Trash.</p></div>
    {error&&<p className="ai-apps-error" role="alert">{error}</p>}
    {created?<div className="ai-apps-created">
      <strong>{created.name} is ready. Copy this token now; it is shown only once.</strong>
      <div className="ai-apps-token"><code>{created.token}</code><button type="button" onClick={()=>copy('token',created.token)}>{copied==='token'?'Copied':'Copy'}</button></div>
      <p>Then add RemoNook to your app:</p>
      {configs.map(([label,text])=><details key={label} open={label==='Claude Code'}><summary>{label}</summary><pre>{text}</pre><button type="button" onClick={()=>copy(label,text)}>{copied===label?'Copied':'Copy'}</button></details>)}
      <p className="ai-apps-note">Keep the token private: anyone with it can use your notes with the access you chose. Disconnect it here at any time.</p>
      <button type="button" className="primary" onClick={()=>setCreated(null)}>Done</button>
    </div>:<form className="ai-apps-new" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const v=await request('/mcp/tokens',{method:'POST',body:JSON.stringify({name,scopes:scopesFor(access)})});setCreated({token:v.token,name:v.name});await load();}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}}}>
      <label>App name<input value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="Claude, Codex, ChatGPT…"/></label>
      <fieldset><legend>What it can do</legend>{ACCESS.map(([id,label,hint])=><label key={id} className="ai-apps-access"><input type="radio" name="ai-access" checked={access===id} onChange={()=>setAccess(id)}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</fieldset>
      <button type="submit" className="primary" disabled={busy||!name.trim()}>{busy?'Connecting…':'Connect an app'}</button>
    </form>}
    <h4>Connected apps</h4>
    {tokens===null?<p className="ai-apps-muted">Loading…</p>:!tokens.length?<p className="ai-apps-muted">No apps connected yet.</p>:<ul className="ai-apps-list">{tokens.map(t=><li key={t.id}><span><strong>{t.name}</strong><small>{accessLabel(t.scopes)} · last used {when(t.last_used_at)}</small></span><button type="button" onClick={async()=>{if(!window.confirm(`Disconnect ${t.name}? It will stop working immediately.`))return;try{await request('/mcp/tokens/'+t.id,{method:'DELETE'});await load();}catch(err){setError(err instanceof Error?err.message:String(err));}}}>Disconnect</button></li>)}</ul>}
    <h4>Recent changes by AI apps</h4>
    {!activity.length?<p className="ai-apps-muted">Nothing yet.</p>:<ul className="ai-apps-activity">{activity.slice(0,20).map(a=><li key={a.id}><span>{a.summary}</span><small>{a.app||'Disconnected app'} · {when(a.created_at)}</small></li>)}</ul>}
    <p className="ai-apps-note">To undo a change, use Trash for deleted notes, or edit the note. Every AI change is checked the same way as an edit from your devices.</p>
  </section>;
}
