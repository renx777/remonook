// Meaning search UI: the "By meaning" section of search, the Related notes panel and the
// duplicate flashcard finder. All read the on-device index in useMeaning.
import {useEffect,useState} from 'react';
import type {Meaning} from './useMeaning';
import {Icon} from './icons';
import './meaning.css';

const pct=(s:number)=>Math.round(s*100)+'%';
export function MeaningOptIn({meaning,compact=false}:{meaning:Meaning;compact?:boolean}){
 if(!meaning.signedIn)return <p className="meaning-note">Sign in to find notes by meaning.</p>;
 return <div className="meaning-optin"><p><strong>Find notes by meaning, not just exact words.</strong>{!compact&&<> Your note text is sent to Cloudflare AI to build an index that stays on this device. Nothing is stored on the server.</>}</p><button type="button" onClick={meaning.enable}>Turn on meaning search</button></div>;
}
function Progress({meaning}:{meaning:Meaning}){const p=meaning.progress;if(p.paused)return <p className="meaning-note">{p.paused}</p>;return p.running?<p className="meaning-note">Indexing notes… {p.indexed} of {p.total}</p>:null;}
function Hit({id,score,meaning,onOpen}:{id:string;score:number;meaning:Meaning;onOpen:(id:string)=>void}){const d=meaning.describe(id);if(!d)return null;return <button type="button" className="meaning-hit" onClick={()=>onOpen(id)}><span className="meaning-hit-title">{d.kind==='QUESTION'&&<Icon name="study" size={13}/>}{d.title}</span><small>{d.path}</small><span className="meaning-score" title="Similarity">{pct(score)}</span></button>;}

/** Results by meaning for the text typed in search. */
export function MeaningSearch({meaning,query,onOpen}:{meaning:Meaning;query:string;onOpen:(id:string)=>void}){
 const [hits,setHits]=useState<{id:string;score:number}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!meaning.enabled||query.trim().length<3){setHits([]);return;}let live=true;setBusy(true);const t=setTimeout(()=>{meaning.search(query).then(h=>{if(live){setHits(h);setError('');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});},600);return()=>{live=false;clearTimeout(t);};},[query,meaning.enabled,meaning.version]);
 if(!meaning.enabled)return <section className="meaning-section" aria-label="Search by meaning"><MeaningOptIn meaning={meaning} compact/></section>;
 if(query.trim().length<3)return null;
 return <section className="meaning-section" aria-label="Search by meaning"><h4>By meaning</h4><Progress meaning={meaning}/>{error&&<p className="meaning-note">{error}</p>}{busy&&!hits.length?<p className="meaning-note">Searching…</p>:!hits.length?<p className="meaning-note">No notes close in meaning.</p>:hits.map(h=><Hit key={h.id} {...h} meaning={meaning} onOpen={onOpen}/>)}</section>;
}

/** Notes related in meaning to one bullet. */
export function RelatedNotes({meaning,id,onOpen,onClose}:{meaning:Meaning;id:string;onOpen:(id:string)=>void;onClose:()=>void}){
 const d=meaning.describe(id),hits=meaning.enabled?meaning.related(id):[];
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[]);
 return <aside className="meaning-panel" role="dialog" aria-label="Related notes"><header><div><small>RELATED NOTES</small><h2>{d?.title||'Bullet'}</h2></div><button className="icon-button" aria-label="Close related notes" onClick={onClose}><Icon name="close"/></button></header>
  <div className="meaning-panel-body">{!meaning.enabled?<MeaningOptIn meaning={meaning}/>:<><Progress meaning={meaning}/>{!meaning.indexed(id)?<p className="meaning-note">This bullet is not indexed yet. It will be in a few seconds.</p>:!hits.length?<p className="meaning-note">Nothing closely related yet.</p>:hits.map(h=><Hit key={h.id} {...h} meaning={meaning} onOpen={onOpen}/>)}
   <button type="button" className="meaning-off" onClick={()=>void meaning.disable()}>Turn off meaning search and delete the index on this device</button></>}</div></aside>;
}

/** Pairs of flashcards with near-identical questions. */
export function DuplicateCards({meaning,questionIds,onOpen,onClose}:{meaning:Meaning;questionIds:string[];onOpen:(id:string)=>void;onClose:()=>void}){
 const pairs=meaning.enabled?meaning.duplicates(questionIds):[],missing=questionIds.filter(id=>!meaning.indexed(id)).length;
 return <div className="meaning-overlay" role="presentation" onClick={onClose}><section className="meaning-dialog" role="dialog" aria-label="Duplicate flashcards" onClick={e=>e.stopPropagation()}><header><div><small>STUDY DESK</small><h2>Duplicate flashcards</h2></div><button className="icon-button" aria-label="Close duplicate flashcards" onClick={onClose}><Icon name="close"/></button></header>
  <div className="meaning-panel-body">{!meaning.enabled?<MeaningOptIn meaning={meaning}/>:<><Progress meaning={meaning}/>{missing>0&&<p className="meaning-note">{missing} card{missing===1?' is':'s are'} still being indexed.</p>}{!pairs.length?<p className="meaning-note">No duplicate questions found among {questionIds.length} flashcards.</p>:<><p className="meaning-note">{pairs.length} pair{pairs.length===1?'':'s'} ask nearly the same thing. Open one to merge or delete it.</p>{pairs.map(p=><div className="meaning-pair" key={p.a+p.b}><Hit id={p.a} score={p.score} meaning={meaning} onOpen={onOpen}/><Hit id={p.b} score={p.score} meaning={meaning} onOpen={onOpen}/></div>)}</>}</>}</div></section></div>;
}
