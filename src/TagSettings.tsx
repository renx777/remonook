import {useMemo,useState} from 'react';
import type {Node} from './data';
import {tagIndex,tagKey,tagSettings as effective,TAG_COLORS,TAG_EFFECTS,EFFECT_LABELS,BUILTIN_TAGS} from './tags.mjs';

const ICONS=['💡','📌','⭐','🔥','📚','🎯','🧠','✅','❓','🏏','💼','🏠','✈️','💰','🎵','🧪'];
const RENAME_PATTERN=/^#?[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u;

/** Settings for one tag: look, behaviour, and rename / merge / remove everywhere. */
export function TagSettingsForm({nodes,tag,settings,disabled,onSave,onRename,onClose}:{nodes:Node[];tag:string;settings:Record<string,any>;disabled:boolean;onSave:(key:string,patch:Record<string,any>)=>void;onRename:(from:string,to:string|null)=>void;onClose:()=>void}){
  const key=tagKey(tag),idx=useMemo(()=>tagIndex(nodes),[nodes]),info=idx.get(key),own=settings[key]||{},eff=effective(key,settings),builtin=(BUILTIN_TAGS as Record<string,any>)[key];
  const [name,setName]=useState(info?.label||key),[confirmRemove,setConfirmRemove]=useState(false),[iconText,setIconText]=useState(own.icon||'');
  const target=name.trim().replace(/^#/,''),targetKey=target.toLowerCase(),valid=RENAME_PATTERN.test(target),changedName=valid&&target!==(info?.label||key),merge=changedName&&targetKey!==key&&idx.has(targetKey),nested=targetKey.startsWith(key+'/');
  const save=(patch:Record<string,any>)=>onSave(key,patch);
  return <div className="tag-settings">
    <form className="tag-settings-name" onSubmit={e=>{e.preventDefault();if(changedName&&!nested){onRename(key,target);onClose();}}}>
      <label htmlFor="tag-settings-name">Name</label>
      <div><span aria-hidden="true">#</span><input id="tag-settings-name" value={name} disabled={disabled} onChange={e=>setName(e.target.value)} aria-invalid={!valid} autoComplete="off"/>
        <button type="submit" className="primary" disabled={disabled||!changedName||nested}>{merge?'Merge':'Rename'}</button></div>
      <small>{!valid?'Letters, numbers, - and _ only; use / for a sub-tag.':nested?'A tag cannot move inside itself.':merge?`#${info?.label||key} will be merged into #${idx.get(targetKey)?.label}, in ${info?.count||0} bullet${info?.count===1?'':'s'}.`:changedName?`Renames it in ${info?.count||0} bullet${info?.count===1?'':'s'}, sub-tags included.`:`Used in ${info?.count||0} bullet${info?.count===1?'':'s'}.`}</small>
    </form>
    <fieldset className="tag-settings-group"><legend>Icon</legend>
      <div className="tag-settings-icons">
        <button type="button" aria-pressed={!own.icon} className={!own.icon?'is-on':''} disabled={disabled} onClick={()=>{setIconText('');save({icon:null});}} title="No icon">{builtin?.icon&&!own.icon?builtin.icon:'—'}</button>
        {ICONS.map(i=><button key={i} type="button" aria-label={`Icon ${i}`} aria-pressed={own.icon===i} className={own.icon===i?'is-on':''} disabled={disabled} onClick={()=>{setIconText(i);save({icon:i});}}>{i}</button>)}
        <input aria-label="Custom icon (an emoji)" placeholder="Other" value={iconText} maxLength={8} disabled={disabled} onChange={e=>setIconText(e.target.value)} onBlur={()=>save({icon:iconText.trim()||null})}/>
      </div>
    </fieldset>
    <fieldset className="tag-settings-group"><legend>Colour</legend>
      <div className="tag-settings-colors">
        <button type="button" aria-label="Automatic colour" aria-pressed={!own.color} className={`tag-swatch is-auto ${!own.color?'is-on':''}`} disabled={disabled} onClick={()=>save({color:null})}/>
        {Object.entries(TAG_COLORS).map(([c,hex])=><button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={own.color===c} className={`tag-swatch ${own.color===c?'is-on':''}`} style={{background:hex}} disabled={disabled} onClick={()=>save({color:c})}/>)}
      </div>
    </fieldset>
    <fieldset className="tag-settings-group"><legend>Effect on its bullets</legend>
      <div className="tag-settings-effects">
        {TAG_EFFECTS.map(e=>{const on=(eff.effect||'none')===e;return <button key={e} type="button" aria-pressed={on} className={on?'is-on':''} disabled={disabled} onClick={()=>save({effect:e===(builtin?.effect||'none')?null:e})}>{(EFFECT_LABELS as Record<string,string>)[e]}</button>;})}
      </div>
      {builtin&&<small>#{key} is a smart tag; your choice here replaces its built-in look.</small>}
    </fieldset>
    <label className="tag-settings-toggle"><input type="checkbox" checked={!!own.pinned} disabled={disabled} onChange={e=>save({pinned:e.target.checked||null})}/>Pin to the top of the sidebar</label>
    <label className="tag-settings-desc">Description<textarea rows={2} defaultValue={own.description||''} maxLength={500} disabled={disabled} placeholder="What this tag is for (optional)" onBlur={e=>save({description:e.target.value.trim()||null})}/></label>
    <div className="tag-settings-danger">
      {!confirmRemove?<button type="button" disabled={disabled||!info?.count} onClick={()=>setConfirmRemove(true)}>Remove from {info?.count||0} bullet{info?.count===1?'':'s'}…</button>
      :<><span>Remove #{info?.label||key} and its sub-tags from every bullet? The bullets stay. You can undo this.</span><button type="button" className="danger" disabled={disabled} onClick={()=>{onRename(key,null);onClose();}}>Remove tag</button><button type="button" onClick={()=>setConfirmRemove(false)}>Cancel</button></>}
    </div>
  </div>;
}
