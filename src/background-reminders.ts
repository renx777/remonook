import {auth} from './auth-service';
import {CLOUD_API} from './cloud-config';
import {accountLocalKey} from './data';
const idKey=()=>accountLocalKey('background-reminder-device');
export async function reminderApi(body:unknown){
 const user=auth?.currentUser;if(!user)throw Error('Sign in to enable background reminders.');
 const token=await user.getIdToken();if(auth?.currentUser?.uid!==user.uid)throw Error('Your account changed.');
 const r=await fetch(CLOUD_API+'/reminders',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});if(auth?.currentUser?.uid!==user.uid)throw Error('Your account changed.');
 const out=await r.json();if(!r.ok)throw Error(out.error||'Background reminders could not be updated.');return out;
}
async function registration(){if(!('serviceWorker' in navigator))throw Error('This browser does not support background reminders.');let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The offline app is updating. Reload and try again.')),10000);})]);}finally{clearTimeout(timer);}}
async function workerMessage(reg:ServiceWorkerRegistration,message:unknown){
 if(!reg.active)throw Error('Save & update RemoNook before enabling background reminders.');
 return new Promise<void>((resolve,reject)=>{const channel=new MessageChannel();let timer:ReturnType<typeof setTimeout>;
  const finish=(error?:Error)=>{clearTimeout(timer);channel.port1.close();channel.port2.close();error?reject(error):resolve();};
  channel.port1.onmessage=e=>finish(e.data?.protocol===1&&e.data?.ok===true?undefined:Error('Reminder device storage is unavailable.'));
  timer=setTimeout(()=>finish(Error('Save & update RemoNook before enabling background reminders. Close other RemoNook tabs if the update is waiting.')),2000);
  try{reg.active!.postMessage(message,[channel.port2]);}catch{finish(Error('The offline app is updating. Reload and try again.'));}
 });
}
const guard=(reg:ServiceWorkerRegistration,id:string|null)=>workerMessage(reg,{type:'REMINDER_DEVICE',id});
export const backgroundEnabled=()=>{try{return typeof Notification!=='undefined'&&Notification.permission==='granted'&&Date.now()-Number(localStorage.getItem(idKey()+'-renewed')||0)<30*86400000&&!!localStorage.getItem(idKey())&&localStorage.getItem(idKey())===localStorage.getItem('remo-active-push-device');}catch{return false;}};
export async function enableBackgroundReminders(renew=false){
 if(!auth?.currentUser)throw Error('Sign in to enable background reminders.');
 if(!('PushManager' in window)||typeof Notification==='undefined')throw Error('Background reminders need a supported browser. On iPhone/iPad, install RemoNook on the Home Screen first.');
 // Permission is requested only on the explicit enable action, before other I/O.
 if(!renew&&await Notification.requestPermission()!=='granted')throw Error('Notifications are blocked. Calendar is unchanged.');
 if(Notification.permission!=='granted')throw Error('Notifications are blocked.');
 const owner=auth.currentUser.uid,key=idKey(),reg=await registration();await workerMessage(reg,{type:'REMINDER_PROTOCOL'});let id=renew?localStorage.getItem(key):null;
 if(renew&&!id)return;let subscription=await reg.pushManager.getSubscription();
 if(!id){await guard(reg,null);await subscription?.unsubscribe();subscription=null;id=crypto.randomUUID();}
 const {publicKey}=await reminderApi({action:'key'});
 if(!subscription){const bytes=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
 if(auth?.currentUser?.uid!==owner){await subscription.unsubscribe();throw Error('Your account changed.');}
 try{await reminderApi({id,subscription:subscription.toJSON(),zone:Intl.DateTimeFormat().resolvedOptions().timeZone});if(auth?.currentUser?.uid!==owner)throw Error('Your account changed.');localStorage.setItem(key,id!);localStorage.setItem('remo-active-push-device',id!);localStorage.setItem(key+'-renewed',String(Date.now()));localStorage.setItem(key+'-zone',Intl.DateTimeFormat().resolvedOptions().timeZone);await guard(reg,id);}
 catch(e){if(!renew||auth?.currentUser?.uid!==owner){await guard(reg,null).catch(()=>{});await subscription.unsubscribe().catch(()=>{});try{localStorage.removeItem(key);if(localStorage.getItem('remo-active-push-device')===id)localStorage.removeItem('remo-active-push-device');}catch{}}throw e;}
}
/** Revoke browser delivery before sign-out; expired endpoint cleanup remains server-side. */
export async function disableBackgroundReminders(){
 if(typeof localStorage==='undefined')return;const key=idKey(),id=localStorage.getItem(key);if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg){const sub=await reg.pushManager?.getSubscription();if(id||sub||localStorage.getItem('remo-active-push-device'))await guard(reg,null).catch(()=>{});await sub?.unsubscribe();}}
 localStorage.removeItem('remo-active-push-device');localStorage.removeItem(key);localStorage.removeItem(key+'-renewed');localStorage.removeItem(key+'-zone');if(id&&auth?.currentUser)try{await reminderApi({action:'remove',id});}catch{/* Unsubscribed endpoint is unusable even without network. */}
}
export async function renewBackgroundReminders(){const key=idKey();if(backgroundEnabled()&&(Date.now()-Number(localStorage.getItem(key+'-renewed')||0)>86400000||localStorage.getItem(key+'-zone')!==Intl.DateTimeFormat().resolvedOptions().timeZone))await enableBackgroundReminders(true);}
