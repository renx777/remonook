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
 // A #views bullet is the collection; its items carry the traits. Just drop the tag there.
 if(tagsInText(n.text||'').some(t=>t.key==='views'))return {doc:withNodes(doc,doc.tables.bullets.map(x=>x.id===owner?withoutTraitsTag(x):x)),block:null,row:null};
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
const DEFAULTS={fields:null,sort:'',dir:'asc',filterKey:'',filter:'',conditions:[],match:'all',group:'',groupDir:'asc',cover:'auto',cardSize:220,fit:'cover',ratio:1.5};
export const FILTER_OPS=[['contains','contains'],['not','does not contain'],['is','is'],['empty','is empty'],['notempty','is not empty'],['gt','is greater than'],['lt','is less than']];
const OPS=new Set(FILTER_OPS.map(([k])=>k));
const clamp=(v,lo,hi,d)=>{v=Number(v);return Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;};
/** Cleans one view's settings (anything stored, possibly by an older or newer app). */
function settingsOf(v){v=v&&typeof v==='object'?v:{};return {
 fields:Array.isArray(v.fields)?v.fields.filter(f=>typeof f==='string').slice(0,12):null,sort:String(v.sort||''),dir:v.dir==='desc'?'desc':'asc',
 filterKey:String(v.filterKey||''),filter:String(v.filter||'').slice(0,200),
 conditions:Array.isArray(v.conditions)?v.conditions.filter(c=>c&&OPS.has(c.op)).slice(0,8).map(c=>({key:String(c.key||''),op:c.op,value:String(c.value??'').slice(0,200)})):[],match:v.match==='any'?'any':'all',
 group:String(v.group||''),groupDir:v.groupDir==='desc'?'desc':'asc',cover:String(v.cover||'auto'),
 cardSize:Math.round(clamp(v.cardSize,140,420,220)),fit:v.fit==='contain'?'contain':'cover',ratio:Math.round(clamp(v.ratio,0.5,2,1.5)*100)/100};}
const SETTING_KEYS=Object.keys(DEFAULTS);
const pick=v=>Object.fromEntries(SETTING_KEYS.map(k=>[k,v[k]]));
/**
 * The view choices for one collection: the active saved view's settings at the top level,
 * plus `tabs` (saved views: {id, name, settings}) and `active`. Defaults when never set.
 */
export function traitView(doc,id){const owner=ownerOf(doc,id),v=latest(doc.web?.traitViews?.[owner]);
 const tabs=Array.isArray(v?.tabs)&&v.tabs.length?v.tabs.filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string').slice(0,12).map(t=>({id:t.id,name:t.name.slice(0,40),settings:settingsOf(t.settings)})):[{id:'all',name:'All',settings:settingsOf({})}];
 const active=tabs.some(t=>t.id===v?.active)?v.active:tabs[0].id;
 return {...DEFAULTS,...settingsOf(v||{}),tabs,active};}
export function setTraitView(doc,id,patch,make=uuid,now=Date.now()){
 const owner=ownerOf(doc,id);if(!doc.tables.bullets.some(n=>n.id===owner))throw Error('This collection was removed.');
 const current=traitView(doc,owner),next={...current,...patch};if(JSON.stringify(next)===JSON.stringify(current))return doc;
 if(next.fields&&next.fields.length>12)throw Error('Show up to 12 traits.');if(String(next.filter).length>200)throw Error('Use up to 200 characters to filter.');
 // Keep the active saved view's stored settings in step with what is shown.
 next.tabs=next.tabs.map(t=>t.id===next.active?{...t,settings:pick(next)}:t);
 const events=doc.web?.traitViews?.[owner]||{};
 return {...doc,web:{...doc.web,traitViews:{...doc.web?.traitViews,[owner]:{...events,[make()]:{...next,at:Math.max(now,(latest(events)?.at||0)+1)}}}}};
}
/** Saved views: switch, add (copying the current one), rename, delete (never the last). */
export function switchTraitTab(doc,id,tab,make=uuid,now=Date.now()){const v=traitView(doc,id),t=v.tabs.find(x=>x.id===tab);if(!t)throw Error('This view was removed.');if(tab===v.active)return doc;return setTraitView(doc,id,{...t.settings,active:tab},make,now);}
export function addTraitTab(doc,id,name,make=uuid,now=Date.now()){const v=traitView(doc,id);name=String(name||'').trim().slice(0,40);if(!name)throw Error('Name the view.');if(v.tabs.length>=12)throw Error('Use up to 12 views.');const tab=make();
 return {doc:setTraitView(doc,id,{tabs:[...v.tabs,{id:tab,name,settings:pick(v)}],active:tab},make,now),tab};}
export function renameTraitTab(doc,id,tab,name,make=uuid,now=Date.now()){const v=traitView(doc,id);name=String(name||'').trim().slice(0,40);if(!name)throw Error('Name the view.');return setTraitView(doc,id,{tabs:v.tabs.map(t=>t.id===tab?{...t,name}:t)},make,now);}
export function deleteTraitTab(doc,id,tab,make=uuid,now=Date.now()){const v=traitView(doc,id);if(v.tabs.length<2)throw Error('Keep at least one view.');const tabs=v.tabs.filter(t=>t.id!==tab);
 if(tab!==v.active)return setTraitView(doc,id,{tabs},make,now);return setTraitView(doc,id,{...tabs[0].settings,tabs,active:tabs[0].id},make,now);}
const plainTitle=n=>String(n.text||'').split('\n')[0].replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').trim();
/** Applies a collection's filter and sort to its items. Items without the sort trait go last. */
export function arrangeCollection(doc,nodes,view,idx=snapshotIndex(doc.tables.bullets)){
 const id=n=>n.mirrorSourceId||n.id,q=view.filter.trim().toLocaleLowerCase();
 let out=nodes;
 const conds=(view.conditions||[]).filter(c=>c.key&&(c.op==='empty'||c.op==='notempty'||c.value.trim()));
 if(conds.length){const test=(n,c)=>{const raw=c.key==='title'?plainTitle(n):noteTrait(doc,id(n),c.key,idx),v=(raw??'').trim(),lv=v.toLocaleLowerCase(),q2=c.value.trim().toLocaleLowerCase();
   switch(c.op){case 'contains':return lv.includes(q2);case 'not':return !lv.includes(q2);case 'is':return lv===q2;case 'empty':return !v;case 'notempty':return !!v;
    case 'gt':case 'lt':{if(!v)return false;const cmp=isNumber(v)&&isNumber(c.value)?Number(v)-Number(c.value):v.localeCompare(c.value.trim(),undefined,{numeric:true});return c.op==='gt'?cmp>0:cmp<0;}}return true;};
  out=out.filter(n=>view.match==='any'?conds.some(c=>test(n,c)):conds.every(c=>test(n,c)));}
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

// ---- Keeping Traits out of other views ----
/** Ids of every Traits bullet and everything under it. Search, mindmaps, canvas sources,
 *  search by meaning and widgets leave these out; the note itself carries them instead. */
export function traitBulletIds(nodes){
 const kids=new Map();for(const n of nodes){const a=kids.get(n.parentId);if(a)a.push(n.id);else kids.set(n.parentId,[n.id]);}
 const out=new Set(),stack=nodes.filter(isTraitsBlock).map(n=>n.id);
 while(stack.length){const id=stack.pop();if(out.has(id))continue;out.add(id);for(const c of kids.get(id)||[])stack.push(c);}
 return out;
}
export const withoutTraits=nodes=>{const ids=traitBulletIds(nodes);return ids.size?nodes.filter(n=>!ids.has(n.id)):nodes;};
/** "Director Steven Spielberg Year 1975" per note, so searching a trait value finds the note. */
export function traitTextByNote(nodes){
 const byId=new Map(nodes.map(n=>[n.id,n])),out=new Map();
 for(const n of nodes){const block=byId.get(n.parentId);if(!isTraitsBlock(block))continue;const r=parseTraitRow(n.text);if(!r)continue;out.set(block.parentId,(out.get(block.parentId)||'')+' '+r.key+' '+r.value);}
 return out;
}

const COVERISH=/cover|poster|image|thumbnail|art|photo|picture/i;
/**
 * The trait bullet whose pasted/uploaded image is a note's cover. `choice` is a trait name,
 * 'auto' or 'none'. A bullet counts by its name alone ("Poster" with an image, no colon needed).
 */
export function traitImageRow(doc,id,choice='auto',idx=snapshotIndex(doc.tables.bullets)){
 if(choice==='none')return null;const media=doc.tables.media||[];
 const hasImage=rid=>media.some(m=>m.bulletId===rid&&String(m.mimeType||'').startsWith('image/'));
 const rows=[];for(const block of traitsBlocks(doc,id,idx))for(const n of idx.children.get(block.id)||[]){const key=(parseTraitRow(n.text)?.key||String(n.text||'').trim().replace(/:+$/,'')).trim();if(key&&key.length<=64&&hasImage(n.id))rows.push({key,id:n.id});}
 if(choice!=='auto')return rows.find(r=>r.key.toLocaleLowerCase()===String(choice).toLocaleLowerCase())?.id||null;
 return (rows.find(r=>COVERISH.test(r.key))||rows[0])?.id||null;
}
/** Trait names used anywhere, most used first (one spelling per name, ignoring case). */
export function knownTraitNames(nodes){
 const byId=new Map(nodes.map(n=>[n.id,n])),counts=new Map(),names=new Map();
 for(const n of nodes){if(!isTraitsBlock(byId.get(n.parentId)))continue;const r=parseTraitRow(n.text);if(!r)continue;const k=r.key.toLocaleLowerCase();if(!names.has(k))names.set(k,r.key);counts.set(k,(counts.get(k)||0)+1);}
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k])=>names.get(k));
}

// ---- Ratings: a trait named like Rating/Stars/Score shows as stars ----
const RATING=/rating|stars?\b|score/i;
/** {value, max} for a rating trait ("4", "4/5", "8/10", "★★★☆☆", or empty), else null. */
export function ratingOf(key,value){
 if(!RATING.test(String(key)))return null;const v=String(value??'').trim();
 if(!v)return {value:0,max:5};if(/^[★☆]+$/.test(v))return {value:[...v].filter(c=>c==='★').length,max:[...v].length};
 const m=/^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?$/.exec(v);if(!m)return null;
 const n=Number(m[1]),max=m[2]?Number(m[2]):n>5?10:5;return max>=1&&max<=10&&n<=max?{value:n,max}:null;
}
/** Text for a new rating, keeping the "/10" style when the old value used it. */
export const ratingText=(n,old)=>{const m=/\/\s*(\d+)\s*$/.exec(String(old??''));return n?String(n)+(m?'/'+m[1]:''):'';};
/** Rewrites a trait bullet's value, keeping its name and ":"/"::" style. */
export function setTraitValue(doc,rowId,value){
 const n=doc.tables.bullets.find(x=>x.id===rowId),row=n&&parseTraitRow(n.text);if(!row)throw Error('This trait was changed or removed.');
 const sep=/::/.test(n.text.split(row.key)[1]||'')?':: ':': ',text=(row.key+sep+String(value??'')).replace(/\s+$/,'');if(text===n.text)return doc;
 return withNodes(doc,doc.tables.bullets.map(x=>x.id===rowId?{...x,text,formatting:encode([])}:x));
}

// ---- Group by a trait ----
/** Splits arranged items into groups by a trait's value (list values "a, b" are one value). Empty last. */
export function groupCollection(doc,nodes,key,dir='asc',idx=snapshotIndex(doc.tables.bullets)){
 const groups=new Map();for(const n of nodes){const v=(noteTrait(doc,n.mirrorSourceId||n.id,key,idx)||'').trim();const k=v.toLocaleLowerCase();if(!groups.has(k))groups.set(k,{label:v,items:[]});groups.get(k).items.push(n);}
 const sign=dir==='desc'?-1:1;
 return [...groups.values()].sort((a,b)=>{if(!a.label||!b.label)return a.label?-1:b.label?1:0;const c=isNumber(a.label)&&isNumber(b.label)?Number(a.label)-Number(b.label):a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'});return c*sign;});
}
/** Names of trait bullets that hold a pasted image (e.g. "Poster"), for the Image property list. */
export function imageTraitNames(doc,ids,idx=snapshotIndex(doc.tables.bullets)){
 const media=new Set((doc.tables.media||[]).filter(m=>String(m.mimeType||'').startsWith('image/')).map(m=>m.bulletId)),out=new Map();
 for(const id of ids)for(const block of traitsBlocks(doc,id,idx))for(const n of idx.children.get(block.id)||[]){if(!media.has(n.id))continue;const k=(parseTraitRow(n.text)?.key||String(n.text||'').trim().replace(/:+$/,'')).trim();if(k&&k.length<=64&&!out.has(k.toLocaleLowerCase()))out.set(k.toLocaleLowerCase(),k);}
 return [...out.values()];
}

// ---- Setting any trait, new items from the collection's traits ----
/** Sets a note's trait, adding the Traits bullet and/or the trait bullet when missing. */
export function setNoteTrait(doc,noteId,key,value,make=uuid){
 key=String(key||'').trim().replace(/:+/g,'');if(!key||key.length>64)throw Error('Name the trait using up to 64 characters.');
 const row=noteTraits(doc,noteId).find(t=>!t.duplicate&&t.key.toLocaleLowerCase()===key.toLocaleLowerCase());
 if(row)return setTraitValue(doc,row.id,String(value??'').replace(/\r?\n/g,' '));
 let next=doc,block=traitsBlocks(doc,noteId)[0]?.id;
 if(!block){const r=addTraitsBlock(doc,noteId,make);if(!r.block)throw Error('Traits can be added to ordinary notes.');next=r.doc;block=r.block;
  // addTraitsBlock leaves one empty bullet to type into: use it.
  return withNodes(next,next.tables.bullets.map(n=>n.id===r.row?{...n,text:traitRowText(key,value)}:n));}
 const kids=next.tables.bullets.filter(n=>n.parentId===block),blank=kids.find(n=>!String(n.text||'').trim()&&!next.tables.bullets.some(c=>c.parentId===n.id));
 if(blank)return withNodes(next,next.tables.bullets.map(n=>n.id===blank.id?{...n,text:traitRowText(key,value)}:n));
 return withNodes(next,[...next.tables.bullets,bullet(make(),{parentId:block,position:Math.max(-1,...kids.map(n=>n.position))+1,text:traitRowText(key,value)})]);
}
/** A new collection item: an empty title with a Traits bullet listing the collection's trait names. */
export function newCollectionItem(doc,parentId,names,make=uuid){
 const parent=doc.tables.bullets.find(n=>n.id===parentId);if(!parent)throw Error('This collection was removed.');
 const id=make(),block=make(),pos=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===parentId).map(n=>n.position))+1;
 const rows=(names.length?names:['']).slice(0,24).map((k,i)=>bullet(make(),{parentId:block,position:i,text:k?String(k).trim()+':':''}));
 return {doc:withNodes(doc,[...doc.tables.bullets.map(n=>n.id===parentId?{...n,collapsed:false}:n),bullet(id,{parentId,position:pos,text:''}),{...bullet(block,{parentId:id,position:0,text:'Traits'}),traitsBlock:true},...rows]),id};
}

// ---- Details from a link (IMDb, Letterboxd, Goodreads, shops…) ----
const LINK_KEY=/^(link|url|website|source|imdb|letterboxd|goodreads|tmdb|amazon|page)$/i;
/** The web link an item is about: in its title, or a Link/URL/IMDb… trait. */
export function itemLink(doc,id,text,idx){const m=/https?:\/\/[^\s<>"')\]]+/.exec(String(text||''));if(m)return m[0];return noteTraits(doc,id,idx).find(t=>!t.duplicate&&LINK_KEY.test(t.key)&&isUrl(t.value))?.value||null;}
/** Traits found in a page preview: Cover, Year, Director, Author, Site — plus a clean title. */
export function traitsFromPreview(p){
 const title=String(p?.title||'').trim(),desc=String(p?.description||'').trim(),site=String(p?.site||'').replace(/^www\./,''),out={};
 if(p?.image&&isUrl(p.image))out.Cover=p.image;
 const year=/\((?:[^()]*?\s)?((?:18|19|20)\d{2})(?:[–-]\d{0,4})?\)/.exec(title)||/\b((?:19|20)\d{2})\b/.exec(/imdb|letterboxd|tmdb|film|movie/i.test(site)?title+' '+desc:'');if(year)out.Year=year[1];
 const dir=/directed by ([^.,|·•\n]+?)\s*(?:\.|,|\||·|•|$| with | starring )/i.exec(title+' . '+desc);if(dir)out.Director=dir[1].trim();
 const author=/goodreads|book|amazon|openlibrary/i.test(site)&&/\bby ([^|·(–\n]+?)(?:\s*[|·(–-]|$)/i.exec(title);if(author)out.Author=author[1].trim();
 if(site)out.Site=site;
 const clean=title.replace(/\s*[-|–·]\s*(IMDb|Letterboxd|Goodreads|Amazon\.[a-z.]+|Wikipedia|TMDB|The Movie Database.*)$/i,'').replace(/\s*\((?:[^()]*?\s)?(?:18|19|20)\d{2}(?:[–-]\d{0,4})?\)\s*/,' ').replace(/\s+directed by .*$/i,'').replace(/\s+by [^|·]+$/i,m=>out.Author?'':m).trim();
 return {title:clean,traits:out};
}
/** Adds the preview's traits a note doesn't have yet; a bare-link title becomes the page title. */
export function applyPreviewTraits(doc,id,preview,make=uuid){
 const {title,traits}=traitsFromPreview(preview);let next=doc;
 for(const [k,v] of Object.entries(traits)){const has=noteTrait(next,id,k);if(has===null||has==='')next=setNoteTrait(next,id,k,v,make);}
 const n=next.tables.bullets.find(x=>x.id===id);
 if(n&&title&&/^\s*https?:\/\/\S+\s*$/.test(n.text)){const url=n.text.trim();next=withNodes(next,next.tables.bullets.map(x=>x.id===id?{...x,text:title,formatting:encode([])}:x));if(noteTrait(next,id,'Link')===null)next=setNoteTrait(next,id,'Link',url,make);}
 return next;
}
