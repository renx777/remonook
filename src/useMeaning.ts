// Meaning search for the signed-in account: opt-in, kept up to date in the background a few
// seconds after edits, and shared by search, Related notes and duplicate flashcards.
import {useEffect,useMemo,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {accountLocalKey,storageAccountKey,type Node} from './data';
import {MeaningIndex,type MeaningProgress} from './meaning-index';
import {displayText,notePath} from './relations.mjs';
import {index} from './domain.mjs';

const flag=()=>{try{return localStorage.getItem(accountLocalKey('remo-meaning'))==='1';}catch{return false;}};
const setFlag=(on:boolean)=>{try{on?localStorage.setItem(accountLocalKey('remo-meaning'),'1'):localStorage.removeItem(accountLocalKey('remo-meaning'));}catch{}};
export type Meaning=ReturnType<typeof useMeaning>;

export function useMeaning(user:User|null,nodes:Node[]){
 const [enabled,setEnabled]=useState(flag),[progress,setProgress]=useState<MeaningProgress>({indexed:0,total:0,running:false}),[version,setVersion]=useState(0);
 const ref=useRef<MeaningIndex|null>(null),account=storageAccountKey();
 useEffect(()=>{setEnabled(flag());},[account]);
 useEffect(()=>{
  if(!enabled||!user)return;
  const idx=new MeaningIndex(account,user);ref.current=idx;idx.onProgress=p=>{setProgress(p);setVersion(v=>v+1);};
  void idx.ready.then(()=>setVersion(v=>v+1));
  return()=>{idx.close();if(ref.current===idx)ref.current=null;};
 },[enabled,user?.uid,account]);
 // Index changes a few seconds after typing stops.
 useEffect(()=>{if(!enabled||!user)return;const t=setTimeout(()=>void ref.current?.sync(nodes),4000);return()=>clearTimeout(t);},[enabled,user?.uid,nodes]);
 const idx=useMemo(()=>index(nodes),[nodes]);
 const describe=(id:string)=>{const n=idx.byId.get(id);return n?{title:displayText(n.text).slice(0,160)||'Untitled',path:n.parentId?notePath(nodes,n.parentId,idx):'Top level',kind:n.kind}:null;};
 return {
  enabled:enabled&&!!user,signedIn:!!user,progress,version,describe,
  enable:()=>{setFlag(true);setEnabled(true);},
  disable:async()=>{setFlag(false);setEnabled(false);await ref.current?.clear();ref.current=null;setProgress({indexed:0,total:0,running:false});},
  search:(q:string)=>ref.current?ref.current.search(q):Promise.resolve([]),
  related:(id:string)=>ref.current?.related(id,10,other=>!idx.byId.has(other))||[],
  indexed:(id:string)=>!!ref.current?.has(id),
  duplicates:(ids:string[])=>ref.current?.duplicates(ids)||[],
  similarTo:(id:string,among:Set<string>)=>ref.current?.similarTo(id,among)||[],
 };
}
