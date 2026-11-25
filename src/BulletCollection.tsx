import {CardDetailsButton} from './CardDetailsDialog';
import {cardDetails} from './card-details.mjs';
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {LayoutGrid,List,ListTree,Table2,ExternalLink,ArrowUpRight,Plus,ArrowUpDown,Filter,ListChecks,Settings2,Rows3,ChevronDown,Pencil,Trash2,X,Link2} from 'lucide-react';
import {mediaLinks} from './media.mjs';
import {snapshotIndex} from './outline-snapshot.mjs';
import {useImageUrl} from './ImageTools';
import {PreviewImage,useLinkPreview} from './LinkPreview';
import {previewPrice} from './link-preview-client';
import './traits-block.css';
import {loadLinkPreview} from './link-preview-client';
import {traitImageRow,FILTER_OPS,newCollectionItem,setNoteTrait,itemLink,applyPreviewTraits,switchTraitTab,addTraitTab,renameTraitTab,deleteTraitTab,imageTraitNames,noteTraits,ratingOf,ratingText,setTraitValue,groupCollection,collectionTraitKeys,noteTrait,traitCover,isTraitsBlock,isUrl,traitView,setTraitView,arrangeCollection,shownTraits} from './traits-block.mjs';
import type {Node,Workspace} from './data';
import './bullet-collection.css';
const VIEWS=[['outline','Outline',ListTree],['grid','Grid',LayoutGrid],['list','Compact list',List],['table','Table',Table2]] as const;
export function BulletViewSwitch({value,onChange,disabled=false}:{value:string;onChange:(view:string)=>void;disabled?:boolean}){
 return <div className="bullet-view-switch" role="group" aria-label="Child bullet view">{VIEWS.map(([key,label,Icon])=><button type="button" key={key} aria-pressed={value===key} aria-label={label+' view'} title={label} disabled={disabled} onClick={()=>onChange(key)}><Icon size={14}/><span>{label}</span></button>)}</div>;
}
function useItem(doc:Workspace,node:Node,assets:Map<string,Blob>,cover='auto'){
 const link=useMemo(()=>mediaLinks(node.text)[0]||null,[node.text]),url=link?.href||null;
 const preview=useLinkPreview(link&&link.kind!=='image'?url:null),media=doc.tables.media.find(m=>m.bulletId===(node.mirrorSourceId||node.id)&&String(m.mimeType||'').startsWith('image/'));
 const local=useImageUrl(media||{},media?assets.get('media/'+media.fileName):undefined);
 // An image pasted into a trait bullet ("Poster" + image) can be the cover too.
 const traitRow=cover==='none'?null:traitImageRow(doc,node.mirrorSourceId||node.id,cover),traitMedia=traitRow?doc.tables.media.find(m=>m.bulletId===traitRow&&String(m.mimeType||'').startsWith('image/')):undefined;
 const traitLocal=useImageUrl(traitMedia||{},traitMedia?assets.get('media/'+traitMedia.fileName):undefined);
 const label=node.text.replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/https?:\/\/[^\s<>"']+/g,'').trim();
 const details=url?cardDetails(doc,node.id,url):null;
 const title=details?.title||(label?label.split('\n')[0]:'')||preview.data?.title||(url?new URL(url).hostname.replace(/^www\./,''):'Untitled');
 // A cover trait the collection chose wins; "none" hides covers; automatic keeps link previews first.
 const chosen=cover!=='auto'&&cover!=='none'?traitCover(doc,node.mirrorSourceId||node.id,cover):null;
 const image=cover==='none'?null:(cover!=='auto'&&traitLocal)||chosen||details?.image||local||(link?.kind==='image'?url:preview.data?.image)||traitLocal||traitCover(doc,node.mirrorSourceId||node.id)||null;
 return {...preview,url,title,image,site:preview.data?.site||(url?new URL(url).hostname.replace(/^www\./,''):''),details,price:previewPrice(details?.amount?{amount:details.amount,currency:details.currency,from:false}:preview.data?.price||null),description:details?.description||preview.data?.description||(!url?node.text.split('\n').slice(1).join('\n'):'')};
}
type ItemProps={doc:Workspace;node:Node;assets:Map<string,Blob>;onOpen:(id:string)=>void;childCount:number;traitKeys:string[];links:boolean;cover:string};
/** A rating trait as stars; tapping a star sets it (tapping the current one clears it). */
function Stars({doc,node,k}:{doc:Workspace;node:Node;k:string}){
 const ctx=useContext(NoteMetadataContext),row=noteTraits(doc,node.mirrorSourceId||node.id).find((t:any)=>!t.duplicate&&t.key.toLocaleLowerCase()===k.toLocaleLowerCase());
 const r=row?ratingOf(row.key,row.value):null;if(!row||!r)return null;const off=!ctx?.save||ctx.disabled;
 const set=(n:number)=>{if(!off)void ctx!.save!(d=>setTraitValue(d,row.id,ratingText(n===r.value?0:n,row.value))).catch(()=>{});};
 return <span className="trait-stars" role="group" aria-label={`${row.key}: ${r.value} of ${r.max}`}>{Array.from({length:r.max},(_,i)=><button type="button" key={i} disabled={off} aria-label={`${i+1} of ${r.max}`} aria-pressed={i<r.value} onClick={e=>{e.stopPropagation();set(i+1);}}>{i<Math.round(r.value)?'★':'☆'}</button>)}</span>;
}
const isRating=(doc:Workspace,node:Node,k:string)=>{const v=noteTrait(doc,node.mirrorSourceId||node.id,k);return v!==null&&!!ratingOf(k,v);};
function TraitCell({doc,node,k}:{doc:Workspace;node:Node;k:string}){const v=noteTrait(doc,node.mirrorSourceId||node.id,k);if(v!==null&&ratingOf(k,v))return <Stars doc={doc} node={node} k={k}/>;if(!v)return <>—</>;if(isUrl(v))return <a className="trait-url" href={v} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{v.replace(/^https?:\/\/(www\.)?/,'')}</a>;return <>{v}</>;}
function PosterCard({doc,node,assets,onOpen,traitKeys,cover}:ItemProps){
 const item=useItem(doc,node,assets,cover),id=node.mirrorSourceId||node.id;
 const shown=traitKeys.filter(k=>!(item.image&&k.toLocaleLowerCase()===String(cover).toLocaleLowerCase())).map(k=>[k,noteTrait(doc,id,k)] as const).filter(([k,v])=>v!==null&&(isRating(doc,node,k)||(v&&!isUrl(v)))).slice(0,4);
 return <article ref={item.root} className="poster-card">
  <button type="button" className="poster-image" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}>{cover!=='none'&&<PreviewImage src={item.image} title={item.title}/>}</button>
  <div className="poster-copy"><button type="button" className="poster-title" title={item.title} onClick={()=>onOpen(node.id)}>{item.title}</button>
   {shown.map(([k,v])=><div key={k} className="poster-trait"><span>{k}</span>{isRating(doc,node,k)?<Stars doc={doc} node={node} k={k}/>:<strong>{v}</strong>}</div>)}</div>
 </article>;
}
function CollectionCard({doc,node,assets,onOpen,childCount,traitKeys,cover}:ItemProps){
 const item=useItem(doc,node,assets,cover),[imageFailed,setImageFailed]=useState(false);useEffect(()=>setImageFailed(false),[item.image]);
 return <article ref={item.root} className={'collection-card'+(item.url||item.image?' has-cover':'')}>
  {((item.image&&!imageFailed)||item.loading)&&<button className="collection-cover" type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><PreviewImage src={item.image} title={item.title} onUnavailable={()=>setImageFailed(true)}/></button>}
  <div className="collection-card-copy"><span className="collection-site">{item.site||'Note'}</span><button type="button" className="collection-title" onClick={()=>onOpen(node.id)}>{item.title}</button>{item.description&&<p>{item.description}</p>}
   {traitKeys.length>0&&<dl className="collection-traits">{traitKeys.filter(k=>!(item.image&&k.toLocaleLowerCase()===String(cover).toLocaleLowerCase())&&!isUrl(noteTrait(doc,node.mirrorSourceId||node.id,k)||'x')).slice(0,4).filter(k=>noteTrait(doc,node.mirrorSourceId||node.id,k)).map(k=><div key={k}><dt>{k}</dt><dd><TraitCell doc={doc} node={node} k={k}/></dd></div>)}</dl>}
   {item.price&&<><strong className="collection-price" title={item.details?.amount?'Your entered price':'Page preview · prices may change'}>{item.price}</strong><small className="collection-price-source">{item.details?.amount?'Your price':'Website preview'}</small></>}
   <footer>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">Open website <ExternalLink size={12}/></a>:<span>{childCount?childCount+' nested '+(childCount===1?'note':'notes'):'Text note'}</span>}<span className="collection-card-actions">{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={14}/></button></span></footer>
   {item.details&&<small className="collection-status">Your details{item.details.amount?' · entered price':''}</small>}{item.error&&!item.details&&<small className="collection-status">Preview unavailable · link kept</small>}{item.loading&&item.url&&<small className="collection-status" role="status">Loading preview…</small>}
  </div>
 </article>;
}
function CollectionTableRow({doc,node,assets,onOpen,traitKeys,links,cover}:ItemProps){
 const item=useItem(doc,node,assets,cover);
 return <tr><td><div ref={item.root} className="collection-table-item"><div className="collection-table-thumbnail"><PreviewImage src={item.image} title={item.title}/></div><div><button className="collection-title" type="button" onClick={()=>onOpen(node.id)}>{item.title}</button>{item.error&&<small>Preview unavailable · link kept</small>}{item.loading&&item.url&&<small role="status">Loading…</small>}</div></div></td>{traitKeys.map(k=><td key={k}><EditableCell doc={doc} node={node} k={k}/></td>)}{links&&<><td>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.site}<ExternalLink size={11}/></a>:'Note'}</td><td>{item.price||'—'}{item.details?.amount&&<small className="collection-status">Your price</small>}</td><td>{item.data?.availability||'—'}</td></>}<td>{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" className="collection-open" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={15}/></button></td></tr>;
}
export function BulletCollection({doc,nodes:all,mode,assets,onOpen,onAdd}:{doc:Workspace;nodes:Node[];mode:string;assets:Map<string,Blob>;onOpen:(id:string)=>void;onAdd?:()=>void}){
 const [limit,setLimit]=useState(24),idx=useMemo(()=>snapshotIndex(doc.tables.bullets),[doc.tables.bullets]);
 // A Traits block describes the collection itself, so it is not one of its items.
 const members=useMemo(()=>all.filter(n=>!isTraitsBlock(n)&&(n.text.trim()||(idx.children.get(n.id)||[]).length>0||doc.tables.media.some(m=>m.bulletId===(n.mirrorSourceId||n.id)))),[all,idx,doc.tables.media]),parent=members[0]?.parentId||all[0]?.parentId||'';
 const available=useMemo(()=>collectionTraitKeys(doc,members.map(n=>n.mirrorSourceId||n.id),idx),[doc,members,idx]);
 const imageNames=useMemo(()=>imageTraitNames(doc,members.map(n=>n.mirrorSourceId||n.id),idx).filter((k:string)=>!available.some(a=>a.toLocaleLowerCase()===k.toLocaleLowerCase())),[doc,members,idx,available]);
 const [closed,setClosed]=useState<Set<string>>(new Set());
 const view=(parent?traitView(doc,parent):traitView(doc,'')) as unknown as View;
 const nodes:Node[]=useMemo(()=>arrangeCollection(doc,members,view,idx) as Node[],[doc,members,idx,JSON.stringify(view)]);
 const traitKeys:string[]=shownTraits(view,available);
 const links=useMemo(()=>!available.length||members.some(n=>mediaLinks(n.text).length>0),[members,available]);
 useEffect(()=>setLimit(24),[nodes[0]?.parentId,mode]);
 const items=nodes.slice(0,limit),props=(node:Node)=>({doc,node,assets,onOpen,childCount:(idx.children.get(node.id)||[]).filter((c:any)=>!isTraitsBlock(c)).length,traitKeys,links,cover:view.cover});
 const renderItems=(list:Node[])=>mode==='table'?<div className="collection-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table><caption className={links?undefined:'sr-only'}>{links?'Child notes and page previews. Prices are captured page data and may change.':'Items and their traits'}</caption><thead><tr><th scope="col">Item</th>{traitKeys.map(k=><th scope="col" key={k}>{k}</th>)}{links&&<><th scope="col">Website</th><th scope="col">Price</th><th scope="col">Availability</th></>}<th scope="col"><span className="sr-only">Open note</span></th></tr></thead><tbody>{list.map(node=><CollectionTableRow key={node.id} {...props(node)}/>)}</tbody></table></div>
  :mode==='grid'&&available.length>0?<div className="poster-grid" style={{'--card':view.cardSize+'px','--ratio':String(view.ratio),'--fit':view.fit} as React.CSSProperties}>{list.map(node=><PosterCard key={node.id} {...props(node)}/>)}</div>
  :<div className="collection-items">{list.map(node=><CollectionCard key={node.id} {...props(node)}/>)}</div>;
 return <div className={'bullet-collection collection-'+mode}>
  {parent&&available.length>0?<CollectionBar parent={parent} view={view} available={available} imageNames={imageNames} mode={mode} count={nodes.length} total={members.length} onAdd={onAdd} onOpen={onOpen} items={members}/>
  :<div className="collection-toolbar"><span>{members.length} {members.length===1?'item':'items'}</span>{onAdd&&<button type="button" onClick={onAdd}><Plus size={14}/>Add note or link</button>}</div>}
  {!members.length&&<div className="collection-empty"><LayoutGrid size={25}/><p>A little room for a collection.</p><small>Add child notes or paste website links, then choose how to see them.</small>{onAdd&&<button type="button" onClick={onAdd}>Add your first item</button>}</div>}
  {nodes.length>0&&(view.group?groupCollection(doc,items,view.group,view.groupDir,idx).map((g:{label:string;items:Node[]})=>{const key=g.label.toLocaleLowerCase()||'\u0000';const isClosed=closed.has(key);
    return <section key={key} className="collection-group"><button type="button" className="collection-group-head" aria-expanded={!isClosed} onClick={()=>setClosed(c=>{const n=new Set(c);if(n.has(key))n.delete(key);else n.add(key);return n;})}><ChevronDown size={14} className={isClosed?'is-closed':''}/><span>{g.label||'No '+view.group}</span><small>{g.items.length}</small></button>{!isClosed&&renderItems(g.items)}</section>;})
   :renderItems(items))}
  {nodes.length>limit&&<button className="collection-more" type="button" onClick={()=>setLimit(value=>value+24)}>Show {Math.min(24,nodes.length-limit)} more · {nodes.length-limit} remaining</button>}
  {nodes.length>0&&<p className="collection-footnote">Your original notes, in a different view. Website details may be unavailable or change.</p>}
 </div>;
}

type Tab={id:string;name:string;settings:any};type Cond={key:string;op:string;value:string};
type View=Omit<ReturnType<typeof traitView>,"tabs"|"conditions"|"match">&{tabs:Tab[];conditions:Cond[];match:"all"|"any";active:string};
/** Obsidian-style bar: result count, then Sort, Filter, Properties, Configure and New, each a small panel. */
function CollectionBar({parent,view,available,imageNames,mode,count,total,onAdd,onOpen,items}:{parent:string;view:View;available:string[];imageNames:string[];mode:string;count:number;total:number;onAdd?:()=>void;onOpen:(id:string)=>void;items:Node[]}){
 const ctx=useContext(NoteMetadataContext),[open,setOpen]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState(view.filter),root=useRef<HTMLDivElement>(null);
 useEffect(()=>setFilter(view.filter),[view.filter]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as globalThis.Node))setOpen('');};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen('');};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[open]);
 const set=(patch:Partial<View>)=>{setError('');if(!ctx?.save)return;void ctx.save(d=>setTraitView(d,parent,patch)).catch((e:Error)=>setError(e.message));};
 const run=(fn:(d:Workspace)=>Workspace)=>{setError('');if(!ctx?.save)return Promise.resolve();return ctx.save(fn).catch((e:Error)=>setError(e.message));};
 // New item: an empty title with this collection's trait names ready to fill, opened at once.
 const newItem=()=>{let id='';void run(d=>{const r=newCollectionItem(d,parent,available);id=r.id;return r.doc;}).then(()=>{if(id)onOpen(id);});};
 // Fill from links: each item's page preview adds the traits it is missing (never overwrites).
 const [filling,setFilling]=useState('');
 const fill=async()=>{const doc=ctx?.doc;if(!doc)return;const targets=items.map(n=>({id:n.mirrorSourceId||n.id,url:itemLink(doc,n.mirrorSourceId||n.id,n.text)})).filter(t=>t.url).slice(0,60);
  if(!targets.length){setFilling('No item has a link yet. Put a link in an item\'s title or a Link trait.');return;}
  let done=0,failed=0;for(const t of targets){setFilling(`Reading ${done+failed+1} of ${targets.length}…`);try{const p=await loadLinkPreview(t.url!);await run(d=>applyPreviewTraits(d,t.id,p));done++;}catch{failed++;}}
  setFilling(`Filled ${done} of ${targets.length}${failed?` · ${failed} could not be read`:''}.`);};
 const [tabName,setTabName]=useState(''),[renaming,setRenaming]=useState('');
 const conds=view.conditions||[];const setConds=(c:typeof conds)=>set({conditions:c});
 useEffect(()=>{if(filter===view.filter)return;const t=setTimeout(()=>set({filter}),350);return()=>clearTimeout(t);},[filter]);
 // Sliders show their value at once and save when let go (one undo step, not one per pixel).
 const [draft,setDraft]=useState<{cardSize?:number;ratio?:number}>({});useEffect(()=>setDraft({}),[view.cardSize,view.ratio]);
 const shown:string[]=shownTraits(view,available),off=!ctx?.save||ctx.disabled,same=(a:string,b:string)=>a.toLocaleLowerCase()===b.toLocaleLowerCase();
 const toggle=(k:string)=>set({fields:shown.some(x=>same(x,k))?shown.filter(x=>!same(x,k)):[...shown,k]});
 const tab=(key:string,label:string,Icon:any,active=false)=><button type="button" className={active?'is-active':''} aria-label={label} title={label} aria-expanded={open===key} onClick={()=>setOpen(open===key?'':key)}><Icon size={14}/><span>{label}</span></button>;
 const options=available.map(k=><option key={k} value={k}>{k}</option>);
 return <div className="collection-bar" ref={root}>
  <div className="collection-bar-left"><button type="button" className="collection-tab-button" aria-expanded={open==='views'} aria-label={'View: '+(view.tabs.find(t=>t.id===view.active)?.name||'All')} onClick={()=>setOpen(open==='views'?'':'views')}><LayoutGrid size={14}/><span>{view.tabs.find(t=>t.id===view.active)?.name||'All'}</span><ChevronDown size={13}/></button>
  <span className="collection-count">{count===total?total:count+' of '+total} {total===1?'result':'results'}</span></div>
  <div className="collection-bar-actions">
   {tab('sort','Sort',ArrowUpDown,!!view.sort)}{tab('group','Group',Rows3,!!view.group)}{tab('filter','Filter',Filter,!!view.filter)}{tab('props','Properties',ListChecks)}{tab('config','Configure',Settings2)}
   {(onAdd||available.length>0)&&<button type="button" aria-label="New item" title="New item" disabled={off} onClick={available.length?newItem:onAdd}><Plus size={14}/><span>New</span></button>}
  </div>
  {open==='views'&&<div className="collection-panel collection-panel-left" role="group" aria-label="Saved views">
   <div className="collection-tabs">{view.tabs.map(t=>renaming===t.id?<form key={t.id} onSubmit={e=>{e.preventDefault();void run(d=>renameTraitTab(d,parent,t.id,tabName)).then(()=>setRenaming(''));}}><input autoFocus aria-label="View name" maxLength={40} value={tabName} onChange={e=>setTabName(e.target.value)}/><button type="submit">Save</button></form>
    :<div key={t.id} className={'collection-tab'+(t.id===view.active?' is-active':'')}><button type="button" disabled={off} aria-pressed={t.id===view.active} onClick={()=>void run(d=>switchTraitTab(d,parent,t.id))}>{t.name}</button>
     <button type="button" className="collection-tab-icon" disabled={off} aria-label={'Rename '+t.name} onClick={()=>{setRenaming(t.id);setTabName(t.name);}}><Pencil size={12}/></button>
     {view.tabs.length>1&&<button type="button" className="collection-tab-icon" disabled={off} aria-label={'Delete view '+t.name} onClick={()=>void run(d=>deleteTraitTab(d,parent,t.id))}><Trash2 size={12}/></button>}</div>)}</div>
   <form className="collection-new-tab" onSubmit={e=>{e.preventDefault();const n=tabName.trim();if(!n||renaming)return;void run(d=>addTraitTab(d,parent,n).doc).then(()=>setTabName(''));}}><input aria-label="New view name" placeholder="New view, e.g. Watchlist" maxLength={40} value={renaming?'':tabName} disabled={off||!!renaming} onChange={e=>setTabName(e.target.value)}/><button type="submit" disabled={off||!!renaming||!tabName.trim()}>Add</button></form>
   <small>A new view starts as a copy of the current one. Each view keeps its own sort, group, filters, traits and layout.</small>
  </div>}
  {open&&open!=='views'&&<div className="collection-panel" role="group" aria-label={{sort:'Sort',group:'Group',filter:'Filter',props:'Properties',config:'Configure view'}[open]}>
   {open==='sort'&&<><label>Sort by<select aria-label="Sort by" value={view.sort} disabled={off} onChange={e=>set({sort:e.target.value})}><option value="">Outline order</option><option value="title">Title</option>{options}</select></label>
    {view.sort&&<label>Order<select aria-label="Sort order" value={view.dir} disabled={off} onChange={e=>set({dir:e.target.value as 'asc'|'desc'})}><option value="asc">Ascending (A→Z, 1→9)</option><option value="desc">Descending (Z→A, 9→1)</option></select></label>}</>}
   {open==='group'&&<><label>Group by<select aria-label="Group by" value={view.group} disabled={off} onChange={e=>set({group:e.target.value})}><option value="">No grouping</option>{options}</select></label>
    {view.group&&<label>Group order<select aria-label="Group order" value={view.groupDir} disabled={off} onChange={e=>set({groupDir:e.target.value as 'asc'|'desc'})}><option value="asc">Ascending (A→Z, 1→9)</option><option value="desc">Descending (Z→A, 9→1)</option></select></label>}</>}
   {open==='filter'&&<><label>Trait<select aria-label="Filter trait" value={view.filterKey} disabled={off} onChange={e=>set({filterKey:e.target.value})}><option value="">Any trait or title</option>{options}</select></label>
    <label>Contains<input type="search" autoFocus aria-label="Filter text" placeholder="Type to filter" value={filter} disabled={off} onChange={e=>setFilter(e.target.value)}/></label>
    <div className="collection-conditions" role="group" aria-label="Conditions">{conds.length>1&&<label className="collection-match">Show items matching<select aria-label="Match" value={view.match} disabled={off} onChange={e=>set({match:e.target.value as 'all'|'any'})}><option value="all">all conditions</option><option value="any">any condition</option></select></label>}
     {conds.map((c,i)=><div key={i} className="collection-condition"><select aria-label={'Condition '+(i+1)+' trait'} value={c.key} disabled={off} onChange={e=>setConds(conds.map((x,j)=>j===i?{...x,key:e.target.value}:x))}><option value="title">Title</option>{options}</select>
      <select aria-label={'Condition '+(i+1)+' test'} value={c.op} disabled={off} onChange={e=>setConds(conds.map((x,j)=>j===i?{...x,op:e.target.value}:x))}>{FILTER_OPS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
      {c.op!=='empty'&&c.op!=='notempty'&&<CondValue value={c.value} disabled={off} label={'Condition '+(i+1)+' value'} onChange={v=>setConds(conds.map((x,j)=>j===i?{...x,value:v}:x))}/>}
      <button type="button" className="collection-tab-icon" aria-label={'Remove condition '+(i+1)} disabled={off} onClick={()=>setConds(conds.filter((_,j)=>j!==i))}><X size={13}/></button></div>)}
     {conds.length<8&&<button type="button" className="collection-add-condition" disabled={off} onClick={()=>setConds([...conds,{key:available[0]||'title',op:'contains',value:''}])}><Plus size={13}/>Add condition</button>}</div></>}
   {open==='props'&&<><div className="collection-props">{available.map(k=><label key={k}><input type="checkbox" disabled={off} checked={shown.some(x=>same(x,k))} onChange={()=>toggle(k)}/>{k}</label>)}</div>
    <div className="collection-fill"><button type="button" disabled={off||/^Reading/.test(filling)} onClick={()=>void fill()}><Link2 size={13}/>Fill traits from links</button><small>{filling||'Reads each item\'s link (IMDb, Letterboxd, Goodreads, shops…) and adds Cover, Year, Director, Author or Site where missing.'}</small></div></>}
   {open==='config'&&<>
    {mode==='grid'&&<label>Card size <output>{draft.cardSize??view.cardSize}</output><input type="range" aria-label="Card size" min={140} max={420} step={10} value={draft.cardSize??view.cardSize} disabled={off} onChange={e=>setDraft({...draft,cardSize:+e.target.value})} onPointerUp={()=>draft.cardSize&&set({cardSize:draft.cardSize})} onKeyUp={()=>draft.cardSize&&set({cardSize:draft.cardSize})}/></label>}
    <label>Image property<select aria-label="Image property" value={view.cover} disabled={off} onChange={e=>set({cover:e.target.value})}><option value="auto">Automatic</option><option value="none">No image</option>{options}{imageNames.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
    {mode==='grid'&&<><label>Image fit<select aria-label="Image fit" value={view.fit} disabled={off} onChange={e=>set({fit:e.target.value as 'cover'|'contain'})}><option value="cover">Cover (fill and crop)</option><option value="contain">Contain (whole image)</option></select></label>
    <label>Image aspect ratio <output>{(draft.ratio??view.ratio).toFixed(2)}</output><input type="range" aria-label="Image aspect ratio" min={0.5} max={2} step={0.05} value={draft.ratio??view.ratio} disabled={off} onChange={e=>setDraft({...draft,ratio:+e.target.value})} onPointerUp={()=>draft.ratio&&set({ratio:draft.ratio})} onKeyUp={()=>draft.ratio&&set({ratio:draft.ratio})}/></label></>}
   </>}
  </div>}
  {error&&<span role="alert" className="trait-error">{error}</span>}
 </div>;
}

/** A condition's value: typed freely, saved after a short pause. */
function CondValue({value,disabled,label,onChange}:{value:string;disabled:boolean;label:string;onChange:(v:string)=>void}){
 const [v,setV]=useState(value);useEffect(()=>setV(value),[value]);
 useEffect(()=>{if(v===value)return;const t=setTimeout(()=>onChange(v),400);return()=>clearTimeout(t);},[v]);
 return <input aria-label={label} value={v} disabled={disabled} placeholder="value" onChange={e=>setV(e.target.value)}/>;
}
/** A table cell that edits the trait bullet in place (adding it when the item lacks the trait). */
function EditableCell({doc,node,k}:{doc:Workspace;node:Node;k:string}){
 const ctx=useContext(NoteMetadataContext),id=node.mirrorSourceId||node.id,value=noteTrait(doc,id,k),[editing,setEditing]=useState(false),[draft,setDraft]=useState(value||''),[error,setError]=useState('');
 if(value!==null&&ratingOf(k,value))return <Stars doc={doc} node={node} k={k}/>;
 const off=!ctx?.save||ctx.disabled;
 const commit=()=>{setEditing(false);if(draft===(value||''))return;void ctx!.save!(d=>setNoteTrait(d,id,k,draft.trim())).catch((e:Error)=>setError(e.message));};
 if(editing)return <input className="trait-cell-input" autoFocus aria-label={k} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){setDraft(value||'');setEditing(false);}}}/>;
 return <span className="trait-cell">{value&&isUrl(value)?<a className="trait-url" href={value} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{value.replace(/^https?:\/\/(www\.)?/,'')}</a>:null}
  <button type="button" className={'trait-cell-edit'+(value&&isUrl(value)?' is-icon':'')} disabled={off} aria-label={`Edit ${k}`} title={`Edit ${k}`} onClick={()=>{setDraft(value||'');setEditing(true);}}>{value&&isUrl(value)?<Pencil size={12}/>:(value||<span className="trait-cell-empty">—</span>)}</button>{error&&<small role="alert">{error}</small>}</span>;
}
