// Traits block: Obsidian-style properties that live in the outline itself.
// Typing #traits on a bullet (any case) adds a collapsible child bullet "Traits" (marked
// `traitsBlock: true`). Each of its children is one property written as `key:: value`, so
// properties are ordinary bullets: they sync, undo, search, copy and travel with templates, and
// older apps simply show them as text. Property types are remembered per name for the whole
// workspace (like Obsidian's types), as append-only revisions in `web.traitKeys`.
import {snapshotIndex} from './outline-snapshot.mjs';
import {bullet,marks,encode} from './domain.mjs';
import {tagsInText} from './tags.mjs';
import {withNodes} from './workspace-nodes.mjs';

export const TRAIT_KINDS=[['text','Text'],['list','List'],['number','Number'],['checkbox','Checkbox'],['date','Date'],['datetime','Date & time']];
const KINDS=new Set(TRAIT_KINDS.map(([k])=>k));
const ROW=/^\s*([^:\n]{1,64}?)\s*::\s?(.*)$/s;
const uuid=()=>crypto.randomUUID();
const latest=events=>Object.entries(events||{}).filter(([,v])=>v&&Number.isSafeInteger(v.at)).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];

/** `key:: value` → {key, value}; null for an ordinary bullet. */
export function parseTraitRow(text){const m=ROW.exec(String(text??''));if(!m)return null;const key=m[1].trim();return key?{key,value:m[2].trim()}:null;}
export const traitRowText=(key,value)=>`${String(key).trim()}:: ${value??''}`.replace(/\s+$/,'');
export const isTraitsBlock=n=>!!n&&n.traitsBlock===true;

/** The traits blocks directly under a note (normally one; two can appear after offline edits). */
export function traitsBlocks(doc,id){const idx=snapshotIndex(doc.tables.bullets);return (idx.children.get(id)||[]).filter(isTraitsBlock);}
/** Properties of a note, first block first, in outline order. Later duplicates of a key are kept but marked. */
export function noteTraits(doc,id){
 const idx=snapshotIndex(doc.tables.bullets),out=[],seen=new Set();
 for(const block of traitsBlocks(doc,id))for(const n of idx.children.get(block.id)||[]){const row=parseTraitRow(n.text);if(!row)continue;const k=row.key.toLocaleLowerCase();out.push({...row,id:n.id,block:block.id,type:traitKind(doc,row.key,row.value),duplicate:seen.has(k)});seen.add(k);}
 return out;
}
/** One property value of a note, as text (null when absent). */
export function noteTrait(doc,id,key){const k=String(key).toLocaleLowerCase();return noteTraits(doc,id).find(t=>!t.duplicate&&t.key.toLocaleLowerCase()===k)?.value??null;}

// ---- Types: remembered per property name, inferred the first time ----
export function inferTraitKind(value){const v=String(value??'').trim();if(/^(true|false)$/i.test(v))return 'checkbox';if(/^-?\d+(\.\d+)?$/.test(v))return 'number';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return 'date';if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))return 'datetime';return 'text';}
export function traitKind(doc,key,value=''){const t=latest(doc.web?.traitKeys?.[String(key).toLocaleLowerCase()])?.type;return KINDS.has(t)?t:inferTraitKind(value);}
export function setTraitKind(doc,key,type,make=uuid,now=Date.now()){
 if(!KINDS.has(type))throw Error('Choose a property type.');const k=String(key).trim().toLocaleLowerCase();if(!k||k.length>64)throw Error('Name the property using up to 64 characters.');
 const events=doc.web?.traitKeys?.[k]||{};if(latest(events)?.type===type)return doc;const id=make();
 return {...doc,web:{...doc.web,traitKeys:{...doc.web?.traitKeys,[k]:{...events,[id]:{type,at:Math.max(now,(latest(events)?.at||0)+1)}}}}};
}
/** Normalises a value for a type; throws a readable error when it cannot be stored. */
export function normaliseTraitValue(type,value){
 const v=Array.isArray(value)?value:String(value??'').trim();
 if(type==='list'){const items=(Array.isArray(v)?v:v.split(',')).map(s=>String(s).trim()).filter(Boolean);return [...new Set(items)].join(', ');}
 if(v==='')return '';
 if(type==='number'){if(!/^-?\d+(\.\d+)?$/.test(v))throw Error('Enter a number.');return v;}
 if(type==='checkbox')return /^(true|yes|1)$/i.test(v)?'true':'false';
 if(type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error('Choose a date.');return v;}
 if(type==='datetime'){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))throw Error('Choose a date and time.');return v;}
 if(v.length>4000)throw Error('Use up to 4,000 characters.');return v.replace(/\r?\n/g,' ');
}
export const traitList=v=>String(v??'').split(',').map(s=>s.trim()).filter(Boolean);
export const isUrl=v=>/^https?:\/\/\S+$/i.test(String(v??'').trim());

// ---- Edits (all pure; one call = one undo step) ----
const ownerOf=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(id)?.mirrorSourceId||id;
const childPos=(nodes,parent)=>Math.max(-1,...nodes.filter(n=>n.parentId===parent).map(n=>n.position))+1;
/** Removes the #traits tag(s) from a bullet's text, keeping formatting aligned. */
function withoutTraitsTag(n){
 const code=marks(n.formatting||'',n.text.length).filter(m=>m.style==='CODE');
 const tags=tagsInText(n.text).filter(t=>t.key==='traits'&&!code.some(m=>m.start<=t.start&&m.end>=t.end));if(!tags.length)return n;
 const cuts=tags.map(t=>{let s=t.start,e=t.end;if(n.text[e]===' ')e++;else if(s>0&&n.text[s-1]===' ')s--;return [s,e];});
 let text=n.text;for(const [s,e] of [...cuts].reverse())text=text.slice(0,s)+text.slice(e);
 const shift=at=>{let d=0;for(const [s,e] of cuts){if(at<=s)break;if(at<e)return s-d;d+=e-s;}return at-d;};
 return {...n,text:text.trimEnd(),formatting:encode(marks(n.formatting||'',n.text.length).map(m=>({...m,start:shift(m.start),end:shift(m.end)})).filter(m=>m.end>m.start))};
}
export const hasTraitsTag=n=>!!n&&!n.codeLanguage&&tagsInText(n.text||'').some(t=>t.key==='traits');
/** Ensures a Traits block under the note (first child) and removes the #traits tag. Returns {doc, block}. */
export function addTraitsBlock(doc,id,make=uuid){
 const owner=ownerOf(doc,id),n=doc.tables.bullets.find(x=>x.id===owner);if(!n)throw Error('This note was removed.');
 if(n.codeLanguage||n.blockStyle==='divider'||n.traitsBlock)throw Error('Traits can be added to ordinary notes.');
 let nodes=doc.tables.bullets.map(x=>x.id===owner?{...withoutTraitsTag(x),collapsed:false}:x);
 let block=traitsBlocks({...doc,tables:{...doc.tables,bullets:nodes}},owner)[0];
 if(block){nodes=nodes.map(x=>x.id===block.id?{...x,collapsed:false}:x);}
 else{block=bullet(make(),{parentId:owner,position:0,text:'Traits'});block={...block,traitsBlock:true};
  nodes=[...nodes.map(x=>x.parentId===owner?{...x,position:x.position+1}:x),block];}
 return {doc:withNodes(doc,nodes),block:block.id};
}
export function addTraitRow(doc,blockId,key,type='text',value='',make=uuid,now=Date.now()){
 const block=doc.tables.bullets.find(n=>n.id===blockId);if(!isTraitsBlock(block))throw Error('This Traits block was removed.');
 key=String(key||'').trim().replace(/::/g,':');if(!key||key.length>64)throw Error('Name the property using up to 64 characters.');
 let next=doc;if(!latest(doc.web?.traitKeys?.[key.toLocaleLowerCase()]))next=setTraitKind(next,key,type,make,now);
 const id=make(),row=bullet(id,{parentId:blockId,position:childPos(next.tables.bullets,blockId),text:traitRowText(key,normaliseTraitValue(traitKind(next,key,value),value))});
 return {doc:withNodes(next,[...next.tables.bullets.map(n=>n.id===blockId?{...n,collapsed:false}:n),row]),id};
}
/** Rewrites one property row (rename and/or new value). */
export function setTraitRow(doc,rowId,key,value){
 const n=doc.tables.bullets.find(x=>x.id===rowId);if(!n)throw Error('This property was removed. Your edit is kept here.');
 key=String(key||'').trim().replace(/::/g,':');if(!key||key.length>64)throw Error('Name the property using up to 64 characters.');
 const text=traitRowText(key,normaliseTraitValue(traitKind(doc,key,value),value));if(text===n.text)return doc;
 return withNodes(doc,doc.tables.bullets.map(x=>x.id===rowId?{...x,text,formatting:encode([])}:x));
}
/** Default name for a new property: "property", "property 2", … not already on the note. */
export function freshTraitKey(doc,noteId,base='property'){const used=new Set(noteTraits(doc,noteId).map(t=>t.key.toLocaleLowerCase()));let k=base,i=2;while(used.has(k))k=`${base} ${i++}`;return k;}
/** Property names used anywhere in the workspace, most used first (for suggestions). */
export function knownTraitKeys(doc){const counts=new Map();const idx=snapshotIndex(doc.tables.bullets);for(const n of doc.tables.bullets)if(isTraitsBlock(idx.byId.get(n.parentId))){const r=parseTraitRow(n.text);if(r){const k=r.key;counts.set(k,(counts.get(k)||0)+1);}}return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k])=>k);}
/** Columns for a collection: property names used by its items, most common first. */
export function collectionTraitKeys(doc,ids,limit=6){const counts=new Map();for(const id of ids)for(const t of noteTraits(doc,id)){if(t.duplicate)continue;const k=t.key;counts.set(k,(counts.get(k)||0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([k])=>k);}
/** An image URL among a note's properties (cover, poster, image, thumbnail…), for cards. */
export function traitCover(doc,id){const t=noteTraits(doc,id).find(t=>!t.duplicate&&/cover|poster|image|thumbnail|artwork/i.test(t.key)&&isUrl(t.value));return t?.value||null;}
/** True for bullets inside a Traits block (study, AI and widgets leave them out). */
export function insideTraits(doc,id){const idx=snapshotIndex(doc.tables.bullets);let n=idx.byId.get(id),guard=0;while(n&&guard++<200){if(isTraitsBlock(n))return true;n=idx.byId.get(n.parentId);}return false;}
