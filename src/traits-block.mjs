// Traits: properties that are just bullets.
// Typing #traits on a bullet (any case) adds a child bullet "Traits" (marked `traitsBlock: true`).
// Every child of that bullet written as `Name: value` is a property ("Author: Stephen Hawking").
// They are ordinary bullets: typed, edited, moved, synced and undone like any other.
// A `#views` parent uses its children's traits to show, sort and filter them and to pick a cover.
// Those view choices are stored per collection as append-only revisions in `web.traitViews`.
import {snapshotIndex} from './outline-snapshot.mjs';
import {bullet,marks,encode} from './domain.mjs';
import {tagsInText} from './tags.mjs';
import {withNodes} from './workspace-nodes.mjs';

// "Name: value" or "Name:: value". The name has no colon (so URLs are never names) and the value
// starts after whitespace (so "https://…" alone is not a property).
const ROW=/^\s*([^:\n]{1,64}?)\s*::?(?:[ \t]+([\s\S]*))?$/;
const uuid=()=>crypto.randomUUID();
const latest=events=>Object.entries(events||{}).filter(([,v])=>v&&typeof v==='object'&&Number.isSafeInteger(v.at)).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];

/** `Name: value` → {key, value}; null for any other text. */
export function parseTraitRow(text){const m=ROW.exec(String(text??''));if(!m)return null;const key=m[1].trim();return key&&!/^https?$/i.test(key)?{key,value:(m[2]||'').trim()}:null;}
export const traitRowText=(key,value)=>`${String(key).trim()}: ${value??''}`.replace(/\s+$/,'');
export const isTraitsBlock=n=>!!n&&n.traitsBlock===true;

/** The Traits bullets directly under a note (normally one; two can appear after offline edits). */
export function traitsBlocks(doc,id,idx=snapshotIndex(doc.tables.bullets)){return (idx.children.get(id)||[]).filter(isTraitsBlock);}
/** Properties of a note in outline order. Later repeats of a name are kept but marked. */
export function noteTraits(doc,id,idx=snapshotIndex(doc.tables.bullets)){
 const out=[],seen=new Set();
 for(const block of traitsBlocks(doc,id,idx))for(const n of idx.children.get(block.id)||[]){const row=parseTraitRow(n.text);if(!row)continue;const k=row.key.toLocaleLowerCase();out.push({...row,id:n.id,duplicate:seen.has(k)});seen.add(k);}
 return out;
}
/** One property value of a note (case-insensitive name); null when absent. */
export function noteTrait(doc,id,key,idx){const k=String(key).toLocaleLowerCase();return noteTraits(doc,id,idx).find(t=>!t.duplicate&&t.key.toLocaleLowerCase()===k)?.value??null;}
export const isUrl=v=>/^https?:\/\/\S+$/i.test(String(v??'').trim());
export const isNumber=v=>/^-?\d+(\.\d+)?$/.test(String(v??'').trim());

// ---- Adding a Traits bullet ----
const ownerOf=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(id)?.mirrorSourceId||id;
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
/**
 * Ensures a Traits bullet as the note's first child (with one empty bullet to type the first
 * property into) and removes the #traits tag. Returns {doc, block, row}: `row` is where to type.
 */
export function addTraitsBlock(doc,id,make=uuid){
 const owner=ownerOf(doc,id),n=doc.tables.bullets.find(x=>x.id===owner);if(!n)throw Error('This note was removed.');
 if(n.codeLanguage||n.blockStyle==='divider'||n.traitsBlock)throw Error('Traits can be added to ordinary notes.');
 let nodes=doc.tables.bullets.map(x=>x.id===owner?{...withoutTraitsTag(x),collapsed:false}:x);
 const idx=snapshotIndex(nodes);let block=traitsBlocks(doc,owner,idx)[0],row;
 if(block){nodes=nodes.map(x=>x.id===block.id?{...x,collapsed:false}:x);const kids=idx.children.get(block.id)||[];row=(kids.find(k=>!k.text.trim())||kids[kids.length-1])?.id;}
 if(!block){block={...bullet(make(),{parentId:owner,position:0,text:'Traits'}),traitsBlock:true};
  nodes=[...nodes.map(x=>x.parentId===owner?{...x,position:x.position+1}:x),block];}
 if(!row){row=make();nodes=[...nodes,bullet(row,{parentId:block.id,position:Math.max(-1,...nodes.filter(x=>x.parentId===block.id).map(x=>x.position))+1,text:''})];}
 return {doc:withNodes(doc,nodes),block:block.id,row};
}

// ---- Collections (#views): which traits to show, sort, filter, cover ----
/** Trait names used by a collection's items, most common first. */
export function collectionTraitKeys(doc,ids,idx=snapshotIndex(doc.tables.bullets)){const counts=new Map(),names=new Map();for(const id of ids)for(const t of noteTraits(doc,id,idx)){if(t.duplicate)continue;const k=t.key.toLocaleLowerCase();if(!names.has(k))names.set(k,t.key);counts.set(k,(counts.get(k)||0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k])=>names.get(k));}
const DEFAULTS={fields:null,sort:'',dir:'asc',filterKey:'',filter:'',cover:'auto'};
/** The view choices for one collection (defaults when never set). */
export function traitView(doc,id){const owner=ownerOf(doc,id),v=latest(doc.web?.traitViews?.[owner]);return {...DEFAULTS,...(v?{fields:Array.isArray(v.fields)?v.fields.filter(f=>typeof f==='string').slice(0,12):null,sort:String(v.sort||''),dir:v.dir==='desc'?'desc':'asc',filterKey:String(v.filterKey||''),filter:String(v.filter||''),cover:String(v.cover||'auto')}:{})};}
export function setTraitView(doc,id,patch,make=uuid,now=Date.now()){
 const owner=ownerOf(doc,id);if(!doc.tables.bullets.some(n=>n.id===owner))throw Error('This collection was removed.');
 const current=traitView(doc,owner),next={...current,...patch};if(JSON.stringify(next)===JSON.stringify(current))return doc;
 if(next.fields&&next.fields.length>12)throw Error('Show up to 12 traits.');if(String(next.filter).length>200)throw Error('Use up to 200 characters to filter.');
 const events=doc.web?.traitViews?.[owner]||{};
 return {...doc,web:{...doc.web,traitViews:{...doc.web?.traitViews,[owner]:{...events,[make()]:{...next,at:Math.max(now,(latest(events)?.at||0)+1)}}}}};
}
const plainTitle=n=>String(n.text||'').split('\n')[0].replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').trim();
/** Applies a collection's filter and sort to its items. Items without the sort trait go last. */
export function arrangeCollection(doc,nodes,view,idx=snapshotIndex(doc.tables.bullets)){
 const id=n=>n.mirrorSourceId||n.id,q=view.filter.trim().toLocaleLowerCase();
 let out=nodes;
 if(q)out=out.filter(n=>{const values=view.filterKey?[noteTrait(doc,id(n),view.filterKey,idx)]:[plainTitle(n),...noteTraits(doc,id(n),idx).map(t=>t.value)];return values.some(v=>v!=null&&String(v).toLocaleLowerCase().includes(q));});
 if(view.sort){const val=n=>view.sort==='title'?plainTitle(n):noteTrait(doc,id(n),view.sort,idx),sign=view.dir==='desc'?-1:1;
  out=out.map((n,i)=>({n,i,v:val(n)})).sort((a,b)=>{const ae=a.v==null||a.v==='',be=b.v==null||b.v==='';if(ae||be)return ae===be?a.i-b.i:ae?1:-1;
   const c=isNumber(a.v)&&isNumber(b.v)?Number(a.v)-Number(b.v):String(a.v).localeCompare(String(b.v),undefined,{numeric:true,sensitivity:'base'});return c*sign||a.i-b.i;}).map(x=>x.n);}
 return out;
}
/** The traits a collection shows: the chosen ones, or the six most used. */
export const shownTraits=(view,keys)=>view.fields?view.fields:keys.slice(0,6);
/** A card's cover image from traits: the chosen trait, or (automatic) any trait whose value is an image link. */
export function traitCover(doc,id,choice='auto',idx){if(choice==='none')return null;const all=noteTraits(doc,id,idx).filter(t=>!t.duplicate&&isUrl(t.value));
 if(choice!=='auto')return all.find(t=>t.key.toLocaleLowerCase()===choice.toLocaleLowerCase())?.value||null;
 return (all.find(t=>/cover|poster|image|thumbnail|artwork|photo|picture/i.test(t.key))||all.find(t=>/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(t.value)))?.value||null;}
/** True for bullets inside a Traits bullet. */
export function insideTraits(doc,id){const idx=snapshotIndex(doc.tables.bullets);let n=idx.byId.get(id),guard=0;while(n&&guard++<200){if(isTraitsBlock(n))return true;n=idx.byId.get(n.parentId);}return false;}
