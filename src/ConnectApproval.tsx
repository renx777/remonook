import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {RemoLogo} from './RemoLogo';
import './ai-apps.css';

const LEVELS=[['read','Read only','Search and read your notes.'],['write','Read and write','Also add and edit notes, flashcards, MCQs and bookmarks.'],['delete','Read, write and delete','Also move notes to Trash (you can restore them).']] as const;
const scopesFor=(l:string)=>l==='read'?['read']:l==='write'?['read','write']:['read','write','delete'];

/** Consent screen for an AI app connecting by sign-in (OAuth). Opened as /?connect=<request id>#app. */
export function ConnectApproval({user,requestId,onSignIn}:{user:User|null;requestId:string;onSignIn:()=>void}){
  const [info,setInfo]=useState<{app:string;redirect_host:string;scopes:string[]}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[level,setLevel]=useState('write');
  const call=async(path:string,body?:unknown)=>{const r=await fetch(`${CLOUD_API}/oauth/requests/${requestId}${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+await user!.getIdToken(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'RemoNook could not reach the connection request.');return v;};
  useEffect(()=>{if(!user)return;call('').then(v=>{setInfo(v);setLevel(v.scopes.includes('delete')?'delete':v.scopes.includes('write')?'write':'read');}).catch(e=>setError(e.message));},[user?.uid,requestId]);
  const finish=async(path:string,body:unknown)=>{setBusy(true);try{const v=await call(path,body);window.location.assign(v.redirect);}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}};
  const leave=()=>{history.replaceState(null,'',location.pathname+'#app');location.reload();};
  return <main className="connect-approval">
    <div className="connect-card" role="dialog" aria-labelledby="connect-title">
      <div className="connect-brand"><RemoLogo/>RemoNook</div>
      {!user?<>
        <h1 id="connect-title">Sign in to connect an AI app</h1>
        <p>An AI app wants to use your RemoNook notes. Sign in to RemoNook to review the request.</p>
        <button type="button" className="primary" onClick={onSignIn}>Sign in to RemoNook</button>
      </>:error?<>
        <h1 id="connect-title">Can’t connect this app</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={leave}>Back to RemoNook</button>
      </>:!info?<p role="status">Loading the request…</p>:<>
        <h1 id="connect-title">Allow <strong>{info.app}</strong> to use your RemoNook notes?</h1>
        <p className="connect-muted">Signed in as {user.email||'your account'}. After you allow it, you return to {info.redirect_host}.</p>
        <fieldset><legend>What it can do</legend>{LEVELS.map(([id,label,hint])=><label key={id} className="ai-apps-access"><input type="radio" name="connect-level" checked={level===id} onChange={()=>setLevel(id)}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</fieldset>
        <p className="connect-muted">Changes it makes sync to all your devices. You can see them and disconnect the app any time in Settings → AI apps.</p>
        <div className="connect-actions">
          <button type="button" disabled={busy} onClick={()=>finish('/deny',{})}>Cancel</button>
          <button type="button" className="primary" disabled={busy} onClick={()=>finish('/approve',{scopes:scopesFor(level)})}>{busy?'Connecting…':'Allow'}</button>
        </div>
      </>}
    </div>
  </main>;
}
