import {useEffect,useRef,useState} from 'react';

function entry(doc:Document){
 const src=doc.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
 return src?new URL(src,location.origin).href:null;
}

export function ReleaseUpdate({enabled,onApply}:{enabled:boolean;onApply:()=>Promise<void>}){
 const [available,setAvailable]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dismissed=useRef<string|null>(null);
 useEffect(()=>{
  if(!enabled)return;
  const current=entry(document);if(!current)return;
  let alive=true,request:AbortController|null=null;
  async function check(){
   if(document.visibilityState==='hidden'||navigator.onLine===false||request)return;
   request=new AbortController();const timeout=setTimeout(()=>request?.abort(),10000);
   try{
    // A unique query also bypasses a previous service worker's cached index.
    const response=await fetch('/index.html?app-update='+Date.now(),{cache:'no-store',signal:request.signal});
    if(!response.ok)return;
    const next=entry(new DOMParser().parseFromString(await response.text(),'text/html'));
    if(alive&&next&&next!==current&&next!==dismissed.current)setAvailable(next);
   }catch{/* Offline and transient checks must not interrupt editing. */}
   finally{clearTimeout(timeout);request=null;}
  }
  const first=setTimeout(check,15000),poll=setInterval(check,60000);
  window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);
  return()=>{alive=false;clearTimeout(first);clearInterval(poll);request?.abort();window.removeEventListener('focus',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check);};
 },[enabled]);
 if(!enabled||!available)return null;
 return <aside className="release-update" aria-label="App update">
  <div><p role="status">A new version of RemoNook is ready.</p><div className="release-update-actions"><button className="action" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onApply();}catch(e){setError(e instanceof Error?e.message:'Your changes could not be saved. Try again.');}finally{setBusy(false);}}}>{busy?'Saving…':'Save & update'}</button><button className="study-text-button" disabled={busy} onClick={()=>{dismissed.current=available;setAvailable(null);setError('');}}>Later</button></div>{error&&<p role="alert">{error}</p>}</div>
 </aside>;
}
