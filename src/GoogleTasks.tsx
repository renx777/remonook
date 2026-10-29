import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {Icon} from './icons';
import './google-tasks.css';

type Status={configured:boolean;connected:boolean;connection?:string;email?:string;account?:string;reconnect?:boolean};
export type GoogleTask={id:string;title:string;parent?:string;position?:string;status:string;due?:string;notes?:string};
type Page={items:any[];nextPageToken:string;loading?:boolean;error?:string};
type Service={signedIn:boolean;signIn:()=>void;status:Status|null;loading:boolean;error:string;notice:string;online:boolean;connecting:boolean;pages:Record<string,Page>;enable:()=>void;connect:()=>void;disconnect:()=>Promise<void>;load:(list?:string,more?:boolean,refresh?:boolean)=>Promise<void>;refresh:()=>Promise<boolean>;mutate:(path:string,body:Record<string,unknown>)=>Promise<void>};
const Context=createContext<Service|null>(null);
const cancelled=()=>Object.assign(Error('Request superseded.'),{name:'AbortError'});
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
export function GoogleTasksProvider({user,children,onSignIn}:{user:User|null;children:ReactNode;onSignIn?:()=>Promise<void>}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[connecting,setConnecting]=useState(false),[pages,setPages]=useState<Record<string,Page>>({}),[online,setOnline]=useState(()=>navigator.onLine);
 const current=useRef<Status|null>(null),generation=useRef(0),cache=useRef<Record<string,Page>>({}),requests=useRef(new Set<AbortController>()),inflight=useRef(new Map<string,Promise<void>>()),refreshing=useRef<Promise<boolean>|null>(null),active=useRef(true),statusSequence=useRef(0),connectCleanup=useRef<(()=>void)|null>(null),popup=useRef<Window|null>(null),connectLock=useRef(false);
 const enable=()=>setEnabled(true);
 const clear=()=>{connectCleanup.current?.();generation.current++;for(const c of requests.current)c.abort();requests.current.clear();inflight.current.clear();cache.current={};setPages({});};
 const applyStatus=(next:Status)=>{if(current.current?.connection!==next.connection||current.current?.connected!==next.connected)clear();current.current=next;setStatus(next);};
 const api=async(path:string,body?:Record<string,unknown>,params:Record<string,string>={})=>{
  if(!user||!CLOUD_API)throw Error('Sign in to connect Google Tasks.');
  if(!navigator.onLine)throw Error('You’re offline. Reconnect before changing Google Tasks.');
  const version=generation.current,controller=new AbortController();let sent=false;requests.current.add(controller);
  try{
   const token=await user.getIdToken();if(!active.current||version!==generation.current)throw cancelled();
   const target=new URL(CLOUD_API+'/integrations/google-tasks/'+path);
   const connection=current.current?.connection||'';
   if(!body)for(const [k,v]of Object.entries({...params,...(path!=='status'?{connection}:{})}))target.searchParams.set(k,v);
   sent=true;const response=await fetch(target,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,connection})}:{}),signal:controller.signal,cache:'no-store'});
   const data=await response.json();if(!active.current||version!==generation.current)throw cancelled();
   if(!response.ok){if(data.code==='reconnect')applyStatus({...current.current!,connected:false,reconnect:true});throw Object.assign(Error(data.error||'Google Tasks could not be reached.'),{code:data.code,status:response.status});}
   return data;
  }catch(e){if(path==='create'&&sent&&(e as Error).name!=='AbortError'&&!(e as any).status)throw Object.assign(Error('This task may already have been added. Refresh the list before trying again.'),{code:'ambiguous'});throw e;}finally{requests.current.delete(controller);}
 };
 const refreshStatus=async()=>{const sequence=++statusSequence.current;if(!user||!CLOUD_API){applyStatus({configured:false,connected:false});return;}setLoading(true);try{const next=await api('status');if(sequence!==statusSequence.current)return;applyStatus(next);setError('');return true;}catch(e){if((e as Error).name!=='AbortError')setError(message(e));}finally{if(active.current)setLoading(false);}};
 const publish=(key:string,value:Page)=>{cache.current={...cache.current,[key]:value};setPages(cache.current);};
 const load=(list?:string,more=false,refresh=false):Promise<void>=>{
  const key=list?'tasks:'+list:'lists',existing=inflight.current.get(key);if(existing)return refresh?existing.then(()=>load(list,false,true)):existing;
  if(!current.current?.connected)return Promise.resolve();
  const previous=cache.current[key],version=generation.current;
  const work=(async()=>{
   publish(key,{items:previous?.items||[],nextPageToken:previous?.nextPageToken||'',loading:true});
   try{const data=await api(list?'tasks':'lists',undefined,{...(list?{list}:{}),...(more&&previous?.nextPageToken?{pageToken:previous.nextPageToken}:{})});
    if(version!==generation.current)return;
    const items=more?[...(previous?.items||[]),...data.items]:data.items;
    publish(key,{items:[...new Map(items.map((item:any)=>[item.id,item])).values()],nextPageToken:data.nextPageToken});
   }catch(e){if(version===generation.current&&(e as Error).name!=='AbortError')publish(key,{items:previous?.items||[],nextPageToken:previous?.nextPageToken||'',error:message(e)});}
   finally{if(version===generation.current)inflight.current.delete(key);}
  })();inflight.current.set(key,work);return work;
 };
 const refresh=()=>{if(refreshing.current)return refreshing.current;const work=(async()=>{const ok=await refreshStatus();if(!ok)return false;if(current.current?.connected){await load(undefined,false,true);const keys=Object.keys(cache.current).filter(k=>k.startsWith('tasks:'));await Promise.all(keys.map(key=>load(key.slice(6),false,true)));}return !Object.values(cache.current).some(page=>page.error);})();refreshing.current=work;void work.finally(()=>{if(refreshing.current===work)refreshing.current=null;});return work;};
 const connect=()=>{
  if(connectLock.current)return;setError('');setNotice('');
  if(!user){setError('Sign in to RemoNook before connecting Google Tasks.');return;}
  const win=window.open('about:blank','remo-google-tasks','popup,width=520,height=720');if(!win){setError('Allow popups for RemoNook, then try connecting again.');return;}
  popup.current=win;connectLock.current=true;setConnecting(true);
  const origin=new URL(CLOUD_API).origin,version=generation.current;let state='',finished=false,timer:ReturnType<typeof setInterval>,timeout:ReturnType<typeof setTimeout>;
  const cleanup=()=>{finished=true;window.removeEventListener('message',receive);clearInterval(timer);clearTimeout(timeout);connectCleanup.current=null;connectLock.current=false;if(active.current)setConnecting(false);};
  const receive=async(event:MessageEvent)=>{
   if(event.origin!==origin||event.source!==win||event.data?.type!=='remo-google-tasks'||event.data.state!==state||finished||version!==generation.current)return;
   finished=true;try{if(!event.data.completion)throw Error(event.data.message||'Google authorization was cancelled.');await api('finish',{state,completion:event.data.completion});await refreshStatus();}catch(e){if((e as Error).name!=='AbortError')setError(message(e));}finally{cleanup();}
  };
  window.addEventListener('message',receive);
  timer=setInterval(()=>{if(win.closed&&!finished){finished=true;setError('Connection closed before completion. You can try again.');cleanup();}},1000);
  void api('connect',{}).then(data=>{if(!active.current||version!==generation.current){win.close();cleanup();return;}const target=new URL(data.url);if(target.origin!==origin||target.pathname!=='/integrations/google-tasks/authorize'||target.searchParams.get('state')!==data.state)throw Error('Google Tasks returned an invalid connection URL.');state=data.state;win.location.href=target.href;}).catch(e=>{win.close();cleanup();if((e as Error).name!=='AbortError')setError(message(e));});
  // Browsers may lose the opener; never leave the interface waiting indefinitely.
  connectCleanup.current=()=>{win.close();cleanup();};
  timeout=setTimeout(()=>{if(!finished){finished=true;win.close();setError('Connection timed out. Try connecting again.');cleanup();}},600000);
 };
 const disconnect=async()=>{setError('');try{const data=await api('disconnect',{});applyStatus({configured:true,connected:false});setNotice(data.revoked?'Google Tasks disconnected.':'Disconnected here. Remove RemoNook access at myaccount.google.com/connections to finish revoking Google access.');}catch(e){if((e as Error).name!=='AbortError')setError(message(e));}};
 const mutate=async(path:string,body:Record<string,unknown>)=>{await api(path,body);await load(String(body.list),false,true);};
 useEffect(()=>{active.current=true;return()=>{active.current=false;connectCleanup.current?.();generation.current++;for(const c of requests.current)c.abort();popup.current?.close();};},[user?.uid]);
 useEffect(()=>{if(enabled)void refreshStatus();},[enabled,user?.uid]);
 useEffect(()=>{const on=()=>{setOnline(navigator.onLine);if(enabled&&navigator.onLine)void refresh();},focus=()=>{if(enabled&&document.visibilityState!=='hidden'&&navigator.onLine)void refresh();};window.addEventListener('online',on);window.addEventListener('offline',on);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',on);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[enabled,user?.uid]);
 const signIn=()=>{if(!onSignIn){setError('Open Settings → Account to sign in.');return;}void onSignIn().catch(e=>setError(message(e)));};
 return <Context.Provider value={{signedIn:!!user,signIn,status,loading,error,notice,online,connecting,pages,enable,connect,disconnect,load,refresh,mutate}}>{children}</Context.Provider>;
}
export const useGoogleTasks=()=>{const value=useContext(Context);if(!value)throw Error('Google Tasks provider is missing.');return value;};
export function GoogleTasksConnection(){
 const g=useGoogleTasks();useEffect(()=>g.enable(),[]);
 return <section className="google-tasks-connection" aria-label="Google Tasks connection"><h3>Google Tasks</h3><p>{!g.signedIn?'Sign in to RemoNook to use Google Tasks.':!g.online?'Offline. Connect to the internet to check Google Tasks.':g.loading?'Checking connection…':g.status?.connected?`Connected as ${g.status.email}`:g.status?.reconnect?'Google access expired. Reconnect to continue.':g.status?.configured?'Connect a Google account to use its task lists in Dashboard.':'Google Tasks connection is awaiting setup. Sign in to RemoNook; staging also requires Google OAuth configuration.'}</p><p className="dialog-muted">Google tasks stay in Google. Connecting does not change your RemoNook sign-in or turn tasks into note bullets.</p>{!g.signedIn?<button disabled={!g.online} onClick={g.signIn}>Sign in to RemoNook</button>:g.status?.connected?<button disabled={!g.online||g.loading||g.connecting} onClick={()=>{if(window.confirm('Disconnect Google Tasks? Your tasks will stay in Google.'))void g.disconnect();}}>Disconnect Google Tasks</button>:<button disabled={!g.status?.configured||g.connecting||!g.online} onClick={g.connect}>{g.connecting?'Connecting…':'Connect Google Tasks'}</button>}{g.status?.connected&&<button disabled={!g.online||g.connecting} onClick={g.connect}>Change Google account</button>}<p><a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Manage access in Google <Icon name="forward" size={12}/><span className="dash-sr-only"> (opens in a new tab)</span></a></p>{g.error&&<p role="alert">{g.error}</p>}{g.notice&&<p role="status">{g.notice}</p>}</section>;
}
