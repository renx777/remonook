import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {Sheet} from './Sheet';
import {Icon} from './icons';
import {traitView} from './traits-block.mjs';
import {movieSearchEnabled,movieQuery,movieTargets,searchMovies,movieDetails,bestMatch,normTitle,planMovieTraits,applyMoviePlans,createMovieNote,savedMovieId,MOVIE_FIELDS,DEFAULT_MOVIE_FIELDS} from './movie-search.mjs';
import {movieKey,useMovieKeys,movieFieldPrefs,saveMovieFieldPrefs,type MovieProvider} from './movie-keys';
import './movie-search.css';

type Movie={id:string;title:string;year:string;poster:string;url:string;director?:string;genres?:string;runtime?:string;rating?:string;popularity?:number};
type Change={key:string;before:string;after:string};
type Row={id:string;text:string;status:'checking'|'exact'|'likely'|'ambiguous'|'none'|'current'|'error';movie?:Movie;candidates?:Movie[];changes?:Change[];error?:string};
const NAME:Record<MovieProvider,string>={tmdb:'TMDB',omdb:'OMDb'};
const openConnections=()=>window.dispatchEvent(new CustomEvent('remo-open-settings',{detail:'connections'}));

function Poster({src,size=40}:{src?:string;size?:number}){return src?<img className="movie-thumb" style={{width:size,height:size*1.5}} src={src} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="movie-thumb is-empty" style={{width:size,height:size*1.5}} aria-hidden="true">🎬</span>;}
function ConnectFirst(){return <div className="rn-empty movie-connect"><h3>Connect a movie database</h3><p>Add your free TMDB key once in Settings → Connections. It stays on this device.</p><button className="movie-btn primary" onClick={openConnections}>Open Connections</button></div>;}
function FieldChips({fields,onChange}:{fields:string[];onChange:(v:string[])=>void}){
 return <details className="movie-fields"><summary>Traits to fill <span>{fields.length} of {MOVIE_FIELDS.length}</span></summary><div className="rn-sheet-row">{MOVIE_FIELDS.map(([k,,label])=><button key={k} type="button" className="rn-fchip" title={label} aria-pressed={fields.includes(k)} onClick={()=>{const next=fields.includes(k)?fields.filter(x=>x!==k):[...fields,k];onChange(next);saveMovieFieldPrefs(next);}}>{k==='Link'?'Link':k}</button>)}</div></details>;
}
const changeLine=(c:Change)=><li key={c.key}><b>{c.key}</b>{c.before?<><s>{c.before.length>40?c.before.slice(0,40)+'…':c.before}</s> → </>:' '}<span>{/^https:/.test(c.after)&&c.key!=='TMDB'&&c.key!=='IMDb'?'new image':c.after}</span></li>;

/** Movie lookups for a collection (Add movie, Update from TMDB) or one movie note (Match on TMDB). */
export function MovieSearch({id}:{id:string}){
 const ctx=useContext(NoteMetadataContext),keys=useMovieKeys(),provider=keys.provider;
 const [sheet,setSheet]=useState<'add'|'update'|'match'|null>(null),anchor=useRef<HTMLButtonElement>(null);
 const node=ctx?.doc.tables.bullets.find(n=>n.id===id);
 const recipe=useMemo(()=>{try{return ctx?traitView(ctx.doc,id).recipe:'';}catch{return '';}},[ctx?.doc,id]);
 const parent=node?.parentId?ctx?.doc.tables.bullets.find(n=>n.id===node.parentId):undefined;
 const parentRecipe=useMemo(()=>{try{return ctx&&parent?traitView(ctx.doc,parent.id).recipe:'';}catch{return '';}},[ctx?.doc,parent?.id]);
 if(!ctx||!node)return null;
 const tagged=movieSearchEnabled(node.text),underMovies=parentRecipe==='movie'||!!(parent&&movieSearchEnabled(parent.text)),children=movieTargets(ctx.doc,id).length;
 const collection=recipe==='movie'||(tagged&&!underMovies),single=!collection&&(tagged||underMovies);
 if(!collection&&!single)return null;
 const off=!!ctx.disabled||!ctx.save;
 return <section className="movie-bar" aria-label="Movie lookups">
  {collection?<>
   <button className="movie-btn" disabled={off} onClick={e=>{anchor.current=e.currentTarget;setSheet('add');}}><Icon name="plus" size={15}/>Add movie</button>
   <button className="movie-btn" disabled={off||!children} onClick={e=>{anchor.current=e.currentTarget;setSheet('update');}}><Icon name="refresh" size={15}/>Update from {provider?NAME[provider]:'TMDB'}</button>
  </>:<button className="movie-btn" disabled={off} onClick={e=>{anchor.current=e.currentTarget;setSheet('match');}}><Icon name="search" size={15}/>Match on {provider?NAME[provider]:'TMDB'}</button>}
  {!provider&&<button className="movie-link" onClick={openConnections}>Connect a movie database</button>}
  {sheet==='add'&&<Sheet wide anchor={anchor.current} label="Add movie" onClose={()=>setSheet(null)}><div className="movie-sheet">{provider?<AddMovie id={id} provider={provider}/>:<ConnectFirst/>}</div></Sheet>}
  {sheet==='update'&&<Sheet wide anchor={anchor.current} label="Update movies" onClose={()=>setSheet(null)}><div className="movie-sheet">{provider?<UpdateMovies id={id} provider={provider} onDone={()=>setSheet(null)}/>:<ConnectFirst/>}</div></Sheet>}
  {sheet==='match'&&<Sheet wide anchor={anchor.current} label="Match movie" onClose={()=>setSheet(null)}><div className="movie-sheet">{provider?<MatchMovie id={id} provider={provider} onDone={()=>setSheet(null)}/>:<ConnectFirst/>}</div></Sheet>}
 </section>;
}

function useSearch(provider:MovieProvider,query:string,year:string){
 const [results,setResults]=useState<Movie[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const q=query.trim();if(q.length<2){setResults([]);setError('');return;}const c=new AbortController();setBusy(true);
  const t=setTimeout(()=>{searchMovies(provider,movieKey(provider),q,year,c.signal).then(r=>{setResults(r as Movie[]);setError(r.length?'':'No movies found. Try another spelling or remove the year.');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});},350);
  return ()=>{clearTimeout(t);c.abort();};},[provider,query,year]);
 return {results,busy,error};
}

function AddMovie({id,provider}:{id:string;provider:MovieProvider}){
 const ctx=useContext(NoteMetadataContext)!,[query,setQuery]=useState(''),[fields,setFields]=useState(()=>movieFieldPrefs(DEFAULT_MOVIE_FIELDS)),[added,setAdded]=useState<Record<string,string>>({}),[error,setError]=useState('');
 const {results,busy,error:searchError}=useSearch(provider,query,'');
 const existing=useMemo(()=>new Set(movieTargets(ctx.doc,id).map((n:any)=>normTitle(movieQuery(n,ctx.doc).title)+'|'+movieQuery(n,ctx.doc).year)),[ctx.doc,id]);
 const add=async(m:Movie)=>{setError('');setAdded(a=>({...a,[m.id]:'adding'}));try{const full=await movieDetails(provider,movieKey(provider),m.id);await ctx.save!(d=>createMovieNote(d,id,provider,full,fields).doc);setAdded(a=>({...a,[m.id]:'added'}));}catch(e:any){setAdded(a=>{const n={...a};delete n[m.id];return n;});setError(e.message);}};
 return <>
  <h2>Add a movie</h2>
  <label className="movie-search-box"><Icon name="search" size={16}/><input autoFocus aria-label="Search movies" placeholder="Title, e.g. Alien" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <FieldChips fields={fields} onChange={setFields}/>
  {(searchError||error)&&<p role="alert" className="movie-error">{error||searchError}</p>}
  <ul className="movie-results" aria-busy={busy}>{results.map(m=>{const have=existing.has(normTitle(m.title)+'|'+m.year)||existing.has(normTitle(m.title)+'|'),state=added[m.id];
   return <li key={m.id}><Poster src={m.poster}/><span className="movie-result-text"><b>{m.title}</b><small>{m.year||'Year unknown'}</small></span>
    {state==='added'?<span className="movie-done">✓ Added</span>:have?<span className="movie-muted">In list</span>:<button className="movie-btn" disabled={!!state||ctx.disabled} aria-label={`Add ${m.title} ${m.year}`} onClick={()=>void add(m)}>{state?'Adding…':'Add'}</button>}</li>;})}</ul>
  {busy&&!results.length&&<p className="movie-muted">Searching…</p>}
  <p className="movie-muted movie-credit">{provider==='tmdb'?'Data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.':'Data from the OMDb API.'}</p>
 </>;
}

async function lookup(doc:any,provider:MovieProvider,target:any,fields:string[],overwrite:boolean,signal:AbortSignal):Promise<Row>{
 const key=movieKey(provider),base={id:target.id,text:target.text};
 try{
  const saved=savedMovieId(doc,target.id,provider);
  let match:Movie|null=null,confidence:Row['status']='exact',candidates:Movie[]=[];
  if(saved)match=await movieDetails(provider,key,saved,signal) as Movie;
  else{const q=movieQuery(target,doc);if(!q.title)return {...base,status:'none'};const found=await searchMovies(provider,key,q.title,'',signal) as Movie[];const r=bestMatch(found,q);candidates=r.candidates as Movie[];if(!r.match)return {...base,status:r.confidence as Row['status'],candidates};confidence=r.confidence as Row['status'];match=await movieDetails(provider,key,r.match.id,signal) as Movie;}
  const changes=planMovieTraits(doc,target.id,provider,match,fields,overwrite) as Change[];
  return {...base,status:changes.length?confidence:'current',movie:match!,changes,candidates};
 }catch(e:any){if(e.name==='AbortError')throw e;return {...base,status:'error',error:e.message};}
}

function UpdateMovies({id,provider,onDone}:{id:string;provider:MovieProvider;onDone:()=>void}){
 const ctx=useContext(NoteMetadataContext)!,[fields,setFields]=useState(()=>movieFieldPrefs(DEFAULT_MOVIE_FIELDS)),[overwrite,setOverwrite]=useState(false);
 const [rows,setRows]=useState<Row[]>([]),[picked,setPicked]=useState<Set<string>>(new Set()),[running,setRunning]=useState(false),[message,setMessage]=useState(''),abort=useRef<AbortController|null>(null);
 const targets=movieTargets(ctx.doc,id).slice(0,200);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const run=async()=>{abort.current?.abort();const c=new AbortController();abort.current=c;setRunning(true);setMessage('');setPicked(new Set());
  const out:Row[]=targets.map((t:any)=>({id:t.id,text:t.text,status:'checking'}));setRows([...out]);
  let next=0;const worker=async()=>{while(next<targets.length&&!c.signal.aborted){const i=next++;try{out[i]=await lookup(ctx.doc,provider,targets[i],fields,overwrite,c.signal);}catch{return;}setRows([...out]);if(out[i].status==='error'&&/rate limit|rejected/i.test(out[i].error||'')){c.abort();setMessage(out[i].error||'');}}};
  await Promise.all([worker(),worker(),worker()]);
  if(!c.signal.aborted){setPicked(new Set(out.filter(r=>r.status==='exact'&&r.changes?.length).map(r=>r.id)));}
  setRunning(false);};
 const choose=async(row:Row,m:Movie)=>{setRows(rs=>rs.map(r=>r.id===row.id?{...r,status:'checking'}:r));try{const full=await movieDetails(provider,movieKey(provider),m.id) as Movie;const changes=planMovieTraits(ctx.doc,row.id,provider,full,fields,overwrite) as Change[];setRows(rs=>rs.map(r=>r.id===row.id?{...r,status:changes.length?'exact':'current',movie:full,changes}:r));if(changes.length)setPicked(p=>new Set(p).add(row.id));}catch(e:any){setRows(rs=>rs.map(r=>r.id===row.id?{...r,status:'error',error:e.message}:r));}};
 const apply=async()=>{const plans=rows.filter(r=>picked.has(r.id)&&r.changes?.length).map(r=>({id:r.id,text:r.text,changes:r.changes!}));try{await ctx.save!(d=>applyMoviePlans(d,plans));setMessage(`Updated ${plans.length} ${plans.length===1?'movie':'movies'}. Undo is available.`);setRows([]);setPicked(new Set());}catch(e:any){setMessage(e.message);}};
 const done=rows.filter(r=>r.status!=='checking').length,counts=rows.reduce((a:any,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{});
 return <>
  <h2>Update {targets.length} {targets.length===1?'movie':'movies'}</h2>
  {!rows.length&&<><p className="movie-muted">Fills Traits from {NAME[provider]}. Movies matched before use their saved link, so they always find the same film.</p>
   <FieldChips fields={fields} onChange={setFields}/>
   <label className="movie-remember"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>Replace values that are already filled</label>
   <button className="movie-btn primary movie-wide" disabled={!targets.length||!fields.length} onClick={()=>void run()}>Check {targets.length} {targets.length===1?'movie':'movies'}</button></>}
  {rows.length>0&&<p className="movie-progress" role="status">{running?`Checking ${done} of ${rows.length}…`:[counts.exact&&`${counts.exact} ready`,counts.likely&&`${counts.likely} likely`,counts.ambiguous&&`${counts.ambiguous} need a choice`,counts.current&&`${counts.current} up to date`,(counts.none||0)+(counts.error||0)?`${(counts.none||0)+(counts.error||0)} not found`:''].filter(Boolean).join(' · ')}{running&&<button className="movie-link" onClick={()=>abort.current?.abort()}>Stop</button>}</p>}
  <ul className="movie-review">{rows.filter(r=>r.status!=='current').map(r=><li key={r.id} className={'is-'+r.status}>
   {(r.status==='exact'||r.status==='likely')&&r.movie?<label className="movie-review-head"><input type="checkbox" checked={picked.has(r.id)} onChange={()=>setPicked(p=>{const n=new Set(p);n.has(r.id)?n.delete(r.id):n.add(r.id);return n;})}/><Poster src={r.movie.poster} size={32}/><span><b>{r.text||'Untitled'}</b><small>{r.status==='likely'?'Likely: ':''}{r.movie.title} ({r.movie.year})</small></span></label>
    :<div className="movie-review-head"><Poster size={32}/><span><b>{r.text||'Untitled'}</b><small>{r.status==='checking'?'Checking…':r.status==='ambiguous'?'Which one?':r.status==='error'?r.error:'No match. Open the movie and use Match.'}</small></span></div>}
   {r.changes&&r.changes.length>0&&(r.status==='exact'||r.status==='likely')&&<ul className="movie-changes">{r.changes.map(changeLine)}</ul>}
   {r.status==='ambiguous'&&<div className="movie-candidates">{(r.candidates||[]).map(m=><button key={m.id} className="movie-candidate" onClick={()=>void choose(r,m)}><Poster src={m.poster} size={28}/><span>{m.title}<small>{m.year}</small></span></button>)}</div>}
  </li>)}</ul>
  {message&&<p role="status" className={/Updated/.test(message)?'movie-ok':'movie-error'}>{message}</p>}
  {rows.length>0&&!running&&<div className="movie-actions"><button className="movie-btn" onClick={()=>{setRows([]);setMessage('');}}>Back</button><button className="movie-btn primary" disabled={!picked.size||ctx.disabled} onClick={()=>void apply()}>Apply to {picked.size} {picked.size===1?'movie':'movies'}</button></div>}
  {!rows.length&&/Updated/.test(message)&&<div className="movie-actions"><button className="movie-btn" onClick={onDone}>Done</button></div>}
 </>;
}

function MatchMovie({id,provider,onDone}:{id:string;provider:MovieProvider;onDone:()=>void}){
 const ctx=useContext(NoteMetadataContext)!,node=ctx.doc.tables.bullets.find(n=>n.id===id)!,initial=movieQuery(node,ctx.doc);
 const [query,setQuery]=useState(initial.title),[year,setYear]=useState(initial.year),[fields,setFields]=useState(()=>movieFieldPrefs(DEFAULT_MOVIE_FIELDS)),[overwrite,setOverwrite]=useState(true);
 const [chosen,setChosen]=useState<Movie|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const {results,busy,error:searchError}=useSearch(provider,query,year);
 const changes=chosen?planMovieTraits(ctx.doc,id,provider,chosen,fields,overwrite) as Change[]:[];
 const pick=async(m:Movie)=>{setError('');try{setChosen(await movieDetails(provider,movieKey(provider),m.id) as Movie);}catch(e:any){setError(e.message);}};
 const apply=async()=>{setSaving(true);try{await ctx.save!(d=>applyMoviePlans(d,[{id,text:node.text,changes}]));onDone();}catch(e:any){setError(e.message);setSaving(false);}};
 return <>
  <h2>Match “{initial.title||node.text}”</h2>
  {!chosen?<>
   <div className="movie-query"><label className="movie-search-box"><Icon name="search" size={16}/><input autoFocus aria-label="Movie title" value={query} onChange={e=>setQuery(e.target.value)}/></label><input className="movie-year" aria-label="Year" placeholder="Year" inputMode="numeric" maxLength={4} value={year} onChange={e=>setYear(e.target.value.replace(/\D/g,''))}/></div>
   {(searchError||error)&&<p role="alert" className="movie-error">{error||searchError}</p>}
   <ul className="movie-results" aria-busy={busy}>{results.map(m=><li key={m.id}><Poster src={m.poster}/><span className="movie-result-text"><b>{m.title}</b><small>{m.year||'Year unknown'}</small></span><button className="movie-btn" onClick={()=>void pick(m)}>Choose</button></li>)}</ul>
  </>:<>
   <div className="movie-chosen"><Poster src={chosen.poster} size={56}/><span><b>{chosen.title} ({chosen.year})</b><small>{[chosen.director,chosen.genres,chosen.runtime].filter(Boolean).join(' · ')}</small><button className="movie-link" onClick={()=>setChosen(null)}>Choose another</button></span></div>
   <FieldChips fields={fields} onChange={setFields}/>
   <label className="movie-remember"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>Replace values that are already filled</label>
   {changes.length?<ul className="movie-changes">{changes.map(changeLine)}</ul>:<p className="movie-muted">Nothing to change. This note already has these values.</p>}
   {error&&<p role="alert" className="movie-error">{error}</p>}
   <div className="movie-actions"><button className="movie-btn primary" disabled={!changes.length||saving||ctx.disabled} onClick={()=>void apply()}>Apply {changes.length} {changes.length===1?'change':'changes'}</button></div>
  </>}
 </>;
}
