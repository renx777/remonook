import {RemoLogo} from './RemoLogo';
import {Landing} from './Landing';
import React,{useEffect,useRef,useState} from 'react';
import {initializeApp} from 'firebase/app';
import {getAuth,initializeAuth,browserLocalPersistence,browserPopupRedirectResolver,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut,type User} from 'firebase/auth';
import {CLOUD_ENABLED,firebaseConfig} from './cloud-config';
import {setStorageAccount} from './data';
export type {User};
const firebaseApp=CLOUD_ENABLED?initializeApp(firebaseConfig):null;
const auth=firebaseApp ? (typeof browserPopupRedirectResolver==='function' ? initializeAuth(firebaseApp,{persistence:browserLocalPersistence,popupRedirectResolver:browserPopupRedirectResolver}) : getAuth(firebaseApp)) : null;
let prepareTransition:()=>Promise<void>=async()=>{};
export function setAccountTransitionHandler(handler:()=>Promise<void>){prepareTransition=handler;return ()=>{if(prepareTransition===handler)prepareTransition=async()=>{};};}
export const authenticatedUid=()=>auth?.currentUser?.uid;
export async function googleSignIn(){if(!auth)throw Error('Cloud sign-in is disabled in local development. Configure staging to test sync.');const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
export const googleSignOut=()=>auth?signOut(auth):Promise.resolve();
function CloudAuthGate({children}:{children:(user:User|null)=>React.ReactNode}){
 const [route,setRoute]=useState(()=>window.location.hash);
 useEffect(()=>{const changed=()=>setRoute(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 const [user,setUser]=useState<User|null|undefined>(undefined),initial=useRef(false),[error,setError]=useState('');
 useEffect(()=>onAuthStateChanged(auth!,async next=>{
   // Reload after an account transition to discard all in-memory editors, URLs,
   // undo stacks and folder handles before opening the new account's database.
   if(initial.current){try{await prepareTransition();window.location.hash=next?'app':'home';location.reload();}catch(e){setError(e instanceof Error?e.message:String(e));}return;}
   initial.current=true;setStorageAccount(next?.uid||null);setUser(next);
 },e=>setError(e.message)),[]);
 if(user===undefined)return <div className="startup"><div className="brand"><RemoLogo/>remo</div><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={()=>location.reload()}>Retry</button>}</div>;
 if(route==='#home'||!user&&route!=='#app')return <Landing onSignIn={googleSignIn} signedIn={!!user}/>;
 return <>{error&&<p className="cloud-error" role="alert">{error}</p>}{children(user)}</>;
}

function LocalAuthGate({children}:{children:(user:User|null)=>React.ReactNode}){
 const [route,setRoute]=useState(()=>window.location.hash);
 useEffect(()=>{setStorageAccount(null);const changed=()=>setRoute(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 return route==='#app'?<>{children(null)}</>:<Landing onSignIn={googleSignIn}/>;
}
export function AuthGate(props:{children:(user:User|null)=>React.ReactNode}){return CLOUD_ENABLED?<CloudAuthGate {...props}/>:<LocalAuthGate {...props}/>;}
