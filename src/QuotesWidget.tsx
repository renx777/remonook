import {useEffect,useMemo,useRef,useState} from 'react';
import {Icon} from './icons';
import {chooseQuote,noteQuotes,quotePool} from './quotes.mjs';
import type {Node} from './data';

export function QuotesWidget({nodes,source='all',onNote}:{nodes:Node[];source?:string;onNote:(id:string)=>void}){
 const notes=useMemo(()=>noteQuotes(nodes),[nodes]),pool=useMemo(()=>quotePool(notes,source),[notes,source]);
 const reading=useRef<HTMLElement>(null);
 const [selectedId,setSelectedId]=useState<string|undefined>(()=>chooseQuote(pool)?.id);
 const fallback=useMemo(()=>chooseQuote(pool,selectedId),[pool,selectedId]);
 const quote=pool.find(item=>item.id===selectedId)||fallback;
 useEffect(()=>{reading.current?.scrollTo?.({top:0});},[quote?.id]);
 useEffect(()=>{if(quote?.id!==selectedId)setSelectedId(quote?.id);},[quote?.id,selectedId]);
 return <div className="dash-quotes">
  {quote?<>
   <figure ref={reading} tabIndex={0} aria-label="Quote and attribution" className={`dash-quote-reading ${quote.text.length>180?'is-long':''}`} aria-live="polite" aria-atomic="true">
    <blockquote><p>{quote.text}</p></blockquote>
    <figcaption>{quote.author&&<span className="dash-quote-author">{quote.author}</span>}{quote.source==='notes'?<button className="dash-quote-origin" onClick={()=>onNote(quote.nodeId!)}>From your notes<Icon name="forward" size={12}/></button>:<a className="dash-quote-origin" href={quote.url} title={quote.work} target="_blank" rel="noopener noreferrer">{quote.work}<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg><span className="dash-sr-only"> (opens in a new tab)</span></a>}</figcaption>
   </figure>
   <div className="dash-quote-footer"><span>{source==='notes'?'Your collection':source==='library'?'The library':'A moment of perspective'}</span><button className="dash-quote-next" disabled={pool.length<2} onClick={()=>setSelectedId(chooseQuote(pool,quote.id)?.id)}><Icon name="refresh" size={13}/>Another quote</button></div>
  </>:<div className="dash-quote-empty"><p>A few words worth returning to.</p><span>Tag a bullet <code>#quote</code> to start your collection.</span><button className="dash-quote-origin" onClick={()=>onNote('')}>Open notes<Icon name="forward" size={12}/></button></div>}
 </div>;
}
