import {useMemo} from 'react';
import type {Node} from './data';
import {tagColor} from './relations.mjs';
import {tagIndex,tagKey,relatedTags,tagsInText,tagMatches,tagSettings as effective} from './tags.mjs';
import './tags.css';

/** Heading for a tag's page: shown when the search is exactly one tag. */
export function TagHeader({nodes,tag,settings={},disabled=false,onTag,onClose,onEdit,onFlashcards}:{nodes:Node[];tag:string;settings?:Record<string,any>;disabled?:boolean;onTag:(tag:string)=>void;onClose:()=>void;onEdit?:(key:string)=>void;onFlashcards?:(ids:string[])=>void}){
  const key=tagKey(tag),idx=useMemo(()=>tagIndex(nodes),[nodes]),info=idx.get(key),look=effective(key,settings);
  const related=useMemo(()=>relatedTags(nodes,'#'+key),[nodes,key]);
  const parts:string[]=(info?.label||key).split('/'),color=tagColor('#'+key);
  const {pages,openQuestions}=useMemo(()=>{
    const byId=new Map(nodes.map(n=>[n.id,n]));const roots=new Set<string>(),open:string[]=[];
    for(const n of nodes){
      if(n.codeLanguage||n.mirrorSourceId)continue;const found=tagsInText(n.text);if(!found.some(t=>tagMatches(t.raw,'#'+key)))continue;
      let r:Node|undefined=n;while(r?.parentId&&byId.get(r.parentId))r=byId.get(r.parentId);if(r)roots.add(r.id);
      if(look.effect==='question'&&!found.some(t=>t.key==='answered')&&n.kind!=='QUESTION')open.push(n.id);
    }
    return {pages:roots.size,openQuestions:open};
  },[nodes,key,look.effect]);
  return <header className="tag-header" style={{['--tag' as any]:color}}>
    <nav className="tag-header-path" aria-label="Tag path">
      <button type="button" onClick={onClose}>Tags</button>
      {parts.slice(0,-1).map((p,i)=><span key={i}><span aria-hidden="true">/</span><button type="button" onClick={()=>onTag('#'+parts.slice(0,i+1).join('/'))}>{p}</button></span>)}
    </nav>
    <div className="tag-header-title">
      <h2>{look.icon?<span className="tag-header-icon" aria-hidden="true">{look.icon}</span>:<span aria-hidden="true">#</span>}{parts.at(-1)}</h2>
      <span className="tag-header-count">{info?`${info.count} bullet${info.count===1?'':'s'}${pages?` · ${pages} page${pages===1?'':'s'}`:''}`:'No bullets yet'}</span>
      {onEdit&&<button type="button" className="tag-header-edit" disabled={disabled} onClick={()=>onEdit(key)}>Tag settings</button>}
    </div>
    {look.description&&<p className="tag-header-desc">{look.description}</p>}
    {look.effect==='question'&&onFlashcards&&<p className="tag-header-questions">{openQuestions.length?<>{openQuestions.length} open question{openQuestions.length===1?'':'s'}. Add #answered to close one.<button type="button" disabled={disabled} onClick={()=>onFlashcards(openQuestions)}>Make {openQuestions.length===1?'it a flashcard':'them flashcards'}</button></>:'No open questions.'}</p>}
    {(info?.children.length||related.length)?<div className="tag-header-chips">
      {!!info?.children.length&&<span className="tag-header-label">Sub-tags</span>}
      {info?.children.map((k:string)=>{const t=idx.get(k)!;return <button key={k} type="button" className="tag-chip" style={{['--tag' as any]:tagColor('#'+k)}} onClick={()=>onTag('#'+t.label)}>#{t.label.split('/').at(-1)} <small>{t.count}</small></button>;})}
      {!!related.length&&<span className="tag-header-label">Often with</span>}
      {related.map(r=>{const t=idx.get(r.key);return <button key={r.key} type="button" className="tag-chip" style={{['--tag' as any]:tagColor('#'+r.key)}} onClick={()=>onTag('#'+(t?.label||r.key))}>#{t?.label||r.key} <small>{r.count}</small></button>;})}
    </div>:null}
  </header>;
}
