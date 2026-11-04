import {useEffect,useRef,useState} from 'react';
import {researchStore,type ResearchDraft,type ResearchState,type Node} from './data';

export function useResearchDrafts(account:string){
 const [state,setState]=useState<ResearchState|null>(null),[error,setError]=useState('');
 const current=useRef<ResearchState|null>(null),queue=useRef(Promise.resolve());
 const accountRef=useRef(account);accountRef.current=account;const version=useRef(0);
 const refresh=async()=>{const n=++version.current;try{const next=await researchStore(undefined,undefined,account);if(n!==version.current||accountRef.current!==account)return;current.current=next;setState(next);setError('');}catch{if(n===version.current)setError('Research drafts could not be loaded. Reload to retry.');}};
 useEffect(()=>{current.current=null;setState(null);void refresh();return()=>{version.current++;};},[account]);
 const put=async(draft:ResearchDraft|null,id:string)=>{
  if(!current.current||accountRef.current!==account)throw Error('Research drafts are still loading.');
  const generation=current.current.generation,previous=current.current.drafts[id];
  const drafts={...current.current.drafts};if(draft)drafts[id]=draft;else delete drafts[id];
  current.current={generation,drafts};setState(current.current);
  const write=queue.current.catch(()=>{}).then(async()=>{await researchStore(old=>{const next={...old.drafts};if(draft)next[id]=draft;else delete next[id];return {...old,drafts:next};},generation,account);});
  queue.current=write;try{await write;if(accountRef.current===account)setError('');}catch(e){if(accountRef.current===account){if(!draft&&previous&&current.current?.generation===generation&&!current.current.drafts[id]){current.current={...current.current,drafts:{...current.current.drafts,[id]:previous}};setState(current.current);}setError('Draft not saved. Keep this panel open and copy your text before reloading.');}throw e;}
 };
 return {state,error,put,refresh};
}

