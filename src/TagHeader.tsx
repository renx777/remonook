import {useMemo} from 'react';
import type {Node} from './data';
import {tagColor} from './relations.mjs';
import {tagIndex,tagKey,relatedTags,tagsInText,tagMatches} from './tags.mjs';
import './tags.css';

/** Heading for a tag's page: shown when the search is exactly one tag. */
export function TagHeader({nodes,tag,onTag,onClose}:{nodes:Node[];tag:string;onTag:(tag:string)=>void;onClose:()=>void}){
  const key=tagKey(tag),idx=useMemo(()=>tagIndex(nodes),[nodes]),info=idx.get(key);
  const related=useMemo(()=>relatedTags(nodes,'#'+key),[nodes,key]);
  const parts:string[]=(info?.label||key).split('/'),color=tagColor('#'+key);
  const pages=useMemo(()=>{const byId=new Map(nodes.map(n=>[n.id,n]));const roots=new Set<string>();for(const n of nodes){if(n.codeLanguage||n.mirrorSourceId||!tagsInText(n.text).some(t=>tagMatches(t.raw,'#'+key)))continue;let r:Node|undefined=n;while(r?.parentId&&byId.get(r.parentId))r=byId.get(r.parentId);if(r)roots.add(r.id);}return roots.size;},[nodes,key]);
  return <header className="tag-header" style={{['--tag' as any]:color}}>
    <nav className="tag-header-path" aria-label="Tag path">
      <button type="button" onClick={onClose}>Tags</button>
      {parts.slice(0,-1).map((p,i)=><span key={i}><span aria-hidden="true">/</span><button type="button" onClick={()=>onTag('#'+parts.slice(0,i+1).join('/'))}>{p}</button></span>)}
    </nav>
    <div className="tag-header-title">
      <h2><span aria-hidden="true">#</span>{parts.at(-1)}</h2>
      <span className="tag-header-count">{info?`${info.count} bullet${info.count===1?'':'s'}${pages?` · ${pages} page${pages===1?'':'s'}`:''}`:'No bullets yet'}</span>
    </div>
    {(info?.children.length||related.length)?<div className="tag-header-chips">
      {!!info?.children.length&&<span className="tag-header-label">Sub-tags</span>}
      {info?.children.map((k:string)=>{const t=idx.get(k)!;return <button key={k} type="button" className="tag-chip" style={{['--tag' as any]:tagColor('#'+k)}} onClick={()=>onTag('#'+t.label)}>#{t.label.split('/').at(-1)} <small>{t.count}</small></button>;})}
      {!!related.length&&<span className="tag-header-label">Often with</span>}
      {related.map(r=>{const t=idx.get(r.key);return <button key={r.key} type="button" className="tag-chip" style={{['--tag' as any]:tagColor('#'+r.key)}} onClick={()=>onTag('#'+(t?.label||r.key))}>#{t?.label||r.key} <small>{r.count}</small></button>;})}
    </div>:null}
  </header>;
}
