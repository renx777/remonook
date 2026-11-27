import {useEffect,useMemo,useRef,useState} from 'react';
import type {Workspace} from './data';
import {bookScope} from './local-books';
import {librarySources} from './library-discovery.mjs';
import {useBackClose} from './back-stack';
import './library-search.css';
export function LibrarySearch({doc,owner,uid,assets,onClose,onBook,onArticle}:{doc:Workspace;owner:string;uid?:string;assets:Map<string,Blob>;onClose:()=>void;onBook:(hash:string,unit:number)=>void;onArticle:(id:string,hash:string,quote:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),worker=useRef<Worker|null>(null),sequence=useRef(0),queryRef=useRef(''),previous=useRef(document.activeElement as HTMLElement|null);
 const [query,setQuery]=useState(''),[hits,setHits]=useState<any[]>([]),[states,setStates]=useState<Record<string,string>>({}),[done,setDone]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const sources=useMemo(()=>librarySources(doc),[doc.web.readingBooks,doc.web.bookmarks]);
 useBackClose(true,onClose);
 useEffect(()=>{dialog.current?.showModal();dialog.current?.querySelector('input')?.focus();return()=>{if(previous.current?.isConnected)previous.current.focus();};},[]);
 useEffect(()=>{let active=true;const abort=new AbortController();setHits([]);setStates({});setDone(false);setError('');let w:Worker;
 try{w=new Worker(new URL('./library-worker.ts',import.meta.url),{type:'module'});worker.current=w;
 w.onmessage=e=>{if(!active)return;const m=e.data;if(m.type==='pdf'){void import('./library-pdf').then(({extractLibraryPdf})=>extractLibraryPdf(m.blob,abort.signal)).then(units=>{if(active)w.postMessage({type:'pdf-result',key:m.key,units});}).catch(e=>{if(active)w.postMessage({type:'pdf-result',key:m.key,error:e.message||'This PDF could not be indexed.'});});return;}if(m.type==='results'&&m.sequence===sequence.current)setHits(m.hits);if(m.type==='status'){setStates(s=>({...s,[m.key]:m.state}));if(m.ready)w.postMessage({type:'search',sequence:++sequence.current,query:queryRef.current});}if(m.type==='done')setDone(true);};
 w.onerror=()=>{if(active){setError('Local search could not start. Your books and notes are unchanged.');setDone(true);}};
 w.postMessage({type:'open',owner,bookOwner:bookScope(owner.startsWith('remo-web-user-')?uid:undefined,owner),sources:sources.map(s=>({...s,...(s.path&&assets.has(s.path)?{blob:assets.get(s.path)}:{})}))});
 }catch{setError('Local search is unavailable in this browser. Your books and notes are unchanged.');setDone(true);}
 return()=>{active=false;abort.abort();sequence.current++;w?.terminate();worker.current=null;};
 },[owner,uid,sources,refresh]);
 useEffect(()=>{queryRef.current=query;setHits([]);const id=++sequence.current,t=setTimeout(()=>worker.current?.postMessage({type:'search',sequence:id,query}),150);return()=>clearTimeout(t);},[query]);
 const readyCount=Object.values(states).filter(s=>s.startsWith('Ready')).length;
 const open=(hit:any)=>{const s=sources.find(s=>s.key===hit.key);if(!s||s.hash!==hit.hash)return;onClose();if(s.kind==='article')onArticle(s.id,s.hash,hit.quote);else onBook(s.hash,hit.unit);};
 return <dialog className="library-search-dialog" ref={dialog} aria-labelledby="library-search-title" onCancel={e=>{e.preventDefault();onClose();}}><header><div><small>ON THIS DEVICE</small><h2 id="library-search-title">Search your library</h2></div><button aria-label="Close library search" onClick={onClose}>×</button></header><input aria-label="Search library text" type="search" maxLength={500} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Words or an “exact phrase”…"/>
 <p className="library-search-hint">Books and saved articles available offline. No AI credits used.</p>{error&&<p role="alert">{error}</p>}
 <div className="library-search-results" aria-live="polite">{hits.map((h,i)=>{const s=sources.find(s=>s.key===h.key);return s&&<button key={h.key+':'+h.unit+':'+i} onClick={()=>open(h)}><strong>{s.title}</strong><small>{s.kind==='article'?'Saved article':s.kind==='pdf'?`Page ${h.unit+1}`:`Passage ${h.unit+1}${h.chapter?` · Chapter ${h.chapter}`:''}`}</small><span>{h.snippet}</span></button>;})}{!hits.length&&query.trim()&&<p>{done?`No matches in ${readyCount} searchable sources. Check source status below.`:'Indexing local sources… Results appear as they become ready.'}</p>}{hits.length===40&&<p>First 40 passages. Add another word to narrow your search.</p>}</div>
 <details className="library-search-status"><summary>{readyCount} searchable / {sources.length} sources · {done?'Indexing complete':'Preparing search…'}</summary>{sources.length===0&&<p>Add a PDF, EPUB or saved article to begin.</p>}{sources.map(s=><p key={s.key}><strong>{s.title}</strong><span>{states[s.key]||'Waiting…'}</span></p>)}<button onClick={()=>setRefresh(n=>n+1)}>Refresh local index</button></details></dialog>;
}
