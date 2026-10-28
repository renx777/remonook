import {useEffect,useRef,useState} from 'react';
import {Icon} from './icons';
type Result={title:string;text:string;url:string;source:string};
export function ResearchResults({id,query,onUse,disabled}:{id:string;query:string;onUse:(text:string)=>void;disabled:boolean}){
 const [results,setResults]=useState<Result[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(''),[provider,setProvider]=useState(''),[selected,setSelected]=useState<{index:number;text:string}|null>(null);
 const root=useRef<HTMLElement>(null);
 const controller=useRef<AbortController|null>(null),version=useRef(0);
 const search=async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const request=++version.current;
  setResults([]);setError('');setSelected(null);setSearched(query);if(!query.trim())return;setLoading(true);
  try{
   const response=await fetch('/api/research/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:abort.signal});
   const value=await response.json();if(!response.ok)throw Error(value.error||'Search is unavailable. Try again.');
   if(!Array.isArray(value.results))throw Error('Search is unavailable. Try again.');
   if(request!==version.current||abort.signal.aborted)return;
   setResults(value.results.filter((r:Result)=>r&&typeof r.text==='string'&&typeof r.title==='string'&&typeof r.url==='string'&&/^https?:\/\//.test(r.url)));setProvider(value.provider||'Web');
  }catch(e){if(!abort.signal.aborted&&request===version.current)setError((e as Error).message||'Search could not be reached. Try again.');}
  finally{if(!abort.signal.aborted&&request===version.current)setLoading(false);}
 };
 useEffect(()=>{void search();return()=>{version.current++;controller.current?.abort();};},[id]);
 useEffect(()=>{const update=()=>{const range=window.getSelection();const anchor=range?.anchorNode;const element=(anchor instanceof Element?anchor:anchor?.parentElement)?.closest<HTMLElement>('.research-result-text');if(element&&root.current?.contains(element))selection(Number(element.dataset.result),element);else setSelected(null);};document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 const selection=(index:number,element:HTMLElement)=>{const range=window.getSelection();if(range&&!range.isCollapsed&&element.contains(range.anchorNode)&&element.contains(range.focusNode)){const text=range.toString().trim();setSelected(text?{index,text}:null);}else setSelected(null);};
 return <section ref={root} className="research-results" aria-label="Search results" aria-busy={loading}>
  <button className="research-search" disabled={!query.trim()||loading} onClick={()=>void search()}>{loading?'Searching…':searched===query?'Search again':'Search'}</button>
  {loading&&<p className="research-search-status" role="status">Finding results for your question…</p>}
  {error&&<p className="research-error" role="alert">{error} <button onClick={()=>void search()}>Retry search</button></p>}
  {!loading&&!error&&searched&&<><div className="research-results-heading"><h3>{results.length?'Choose an answer':'No matching results'}</h3><small>{provider} search</small></div><p className="research-hint">{results.length?'Use an excerpt, or select part of its text. Review your answer below before adding.':'Try a shorter topic or reword your question.'}</p>{results.map((result,i)=><article className="research-result" key={result.url}>
   <a href={result.url} target="_blank" rel="noopener noreferrer" className="research-result-source">{result.source} <Icon name="forward" size={11}/></a><h4>{result.title}</h4>
   <p className="research-result-text" data-result={i} onPointerUp={e=>selection(i,e.currentTarget)} onKeyUp={e=>selection(i,e.currentTarget)}>{result.text}</p>
   <button disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>onUse(selected?.index===i?selected.text:result.text)}>{selected?.index===i?'Use selected text':'Use as answer'}</button>
  </article>)}</>}
 </section>;
}
