import {Icon} from './icons';
import {useEffect,useState} from 'react';
import type {Workspace} from './data';
import {accountLocalKey} from './data';
import {dueReminders} from './reminder-delivery.mjs';
import {localDate} from './calendar-events.mjs';
export function ReminderDelivery({doc,controls=false}:{doc:Workspace;controls?:boolean}){
 const key=accountLocalKey('calendar-delivery'),[enabled,setEnabled]=useState(()=>{try{return localStorage.getItem(key)==='enabled';}catch{return false;}}),[message,setMessage]=useState('');
 useEffect(()=>{
  if(!enabled)return;let cancelled=false;
  const check=async()=>{if(!enabled||document.hidden||typeof Notification==='undefined'||Notification.permission!=='granted')return;
   const deliver=()=>{if(cancelled||document.hidden)return;try{const now=new Date(),day=localDate(now),raw=JSON.parse(localStorage.getItem(key+'-receipts')||'{}'),receipts=raw.day===day?raw.keys||{}:{};
    for(const item of dueReminders(doc,now)){if(receipts[item.key])continue;receipts[item.key]=true;localStorage.setItem(key+'-receipts',JSON.stringify({day,keys:receipts}));try{const n=new Notification(item.title,{body:'Your scheduled reminder in RemoNook',tag:item.key});n.onclick=()=>{window.focus();n.close();};}catch{delete receipts[item.key];localStorage.setItem(key+'-receipts',JSON.stringify({day,keys:receipts}));setMessage('Browser delivery is unavailable here. Calendar reminders remain available.');}}
   }catch{setMessage('Reminder delivery needs device storage. Your calendar is unchanged.');}};
   if(navigator.locks)await navigator.locks.request(key,deliver);else deliver();
  };void check();const timer=setInterval(()=>void check(),15000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[doc,key,enabled]);
 if(!controls)return null;
 return <div className="calendar-delivery"><button className="icon-button" aria-label={enabled?'Disable browser reminders':'Enable browser reminders'} title={enabled?'Disable browser reminders':'Enable browser reminders while RemoNook is open'} type="button" onClick={async()=>{try{if(enabled){localStorage.removeItem(key);setEnabled(false);setMessage('Browser reminders disabled on this device.');return;}if(typeof Notification==='undefined'){setMessage('This browser does not support desktop notifications.');return;}const permission=await Notification.requestPermission();if(permission==='granted'){localStorage.setItem(key,'enabled');setEnabled(true);setMessage('Reminders work while RemoNook is open. Delivery may be delayed in background tabs.');}else setMessage('Notifications are blocked. Reminders remain in Calendar.');}catch{setMessage('Could not enable browser reminders. Calendar remains available.');}}}><Icon name="calendar" size={17}/></button>{message&&<p role="status">{message}</p>}</div>;
}
