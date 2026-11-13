import {RemoLogo} from './RemoLogo';
import {Landing} from './Landing';
import {ConnectApproval} from './ConnectApproval';
import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {auth,googleSignIn,googleSignOut,settleAuthOperation} from './auth-service';
import {AccountAccess} from './AccountAccess';
import {CLOUD_ENABLED} from './cloud-config';
import {setStorageAccount,setStorageName} from './data';
import {activeLocalWorkspace,workspaceStorageName,chooseWorkspace} from './workspaces';
import {isApp} from './desktop';
export type {User};
let prepareTransition:()=>Promise<void>=async()=>{};
export function setAccountTransitionHandler(handler:()=>Promise<void>){prepareTransition=handler;return ()=>{if(prepareTransition===handler)prepareTransition=async()=>{};};}
export {googleSignIn,googleSignOut};
export {authenticatedUid} from './auth-service';
export {AccountSecurity} from './AccountAccess';
/** Saves pending edits, then reopens the app in another workspace. */
export async function switchWorkspace(target:{local:string}|'main'){await prepareTransition();chooseWorkspace(target);window.location.hash='app';location.reload();}
export async function openAccountSignIn(){window.dispatchEvent(new window.Event('remo-sign-in'));}
function CloudAuthGate({children}:{children:(user:User|null)=>React.ReactNode}){
 const [route,setRoute]=useState(()=>window.location.hash);
 useEffect(()=>{const changed=()=>setRoute(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 const [user,setUser]=useState<User|null|undefined>(undefined),initial=useRef(false),lastUid=useRef<string|undefined>(undefined),[error,setError]=useState('');
 useEffect(()=>onAuthStateChanged(auth!,async next=>{
   await settleAuthOperation();
   if(next?.uid!==auth?.currentUser?.uid)return;
   if(initial.current && next?.uid===lastUid.current)return;
   lastUid.current=next?.uid;
   // Reload after an account transition to discard all in-memory editors, URLs,
   // undo stacks and folder handles before opening the new account's database.
   if(initial.current){try{await prepareTransition();window.location.hash=next?'app':'home';location.reload();}catch(e){setError(e instanceof Error?e.message:String(e));}return;}
   initial.current=true;setStorageAccount(next?.uid||null);const local=activeLocalWorkspace();if(local)setStorageName(workspaceStorageName(local));setUser(next);
 },e=>setError(e.message)),[]);
 if(user===undefined)return <div className="startup"><div className="brand"><RemoLogo/>RemoNook</div><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={()=>location.reload()}>Retry</button>}</div>;
 const connect=new URLSearchParams(window.location.search).get('connect');
 if(connect&&/^[a-f0-9]{32}$/.test(connect))return <ConnectApproval user={user} requestId={connect} onSignIn={openAccountSignIn}/>;
 // The desktop app opens straight into the app (no website landing page).
 if(!isApp()&&(route==='#home'||!user&&route!=='#app'))return <Landing onSignIn={openAccountSignIn} signedIn={!!user}/>;
 // A device-only workspace runs without a cloud user, so nothing in it can sync.
 return <>{error&&<p className="cloud-error" role="alert">{error}</p>}{children(activeLocalWorkspace()?null:user)}</>;
}

function LocalAuthGate({children}:{children:(user:User|null)=>React.ReactNode}){
 // Choose the storage before the app's first render: child effects run before this gate's.
 useState(()=>{setStorageAccount(null);const local=activeLocalWorkspace();if(local)setStorageName(workspaceStorageName(local));return null;});
 const [route,setRoute]=useState(()=>window.location.hash);
 useEffect(()=>{const changed=()=>setRoute(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 return route==='#app'||isApp()?<>{children(null)}</>:<Landing onSignIn={openAccountSignIn}/>;
}
export function AuthGate(props:{children:(user:User|null)=>React.ReactNode}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('remo-sign-in',show);return()=>window.removeEventListener('remo-sign-in',show);},[]);
 return <>{CLOUD_ENABLED?<CloudAuthGate {...props}/>:<LocalAuthGate {...props}/ >}{open&&<AccountAccess onClose={()=>setOpen(false)}/>}</>;
}
