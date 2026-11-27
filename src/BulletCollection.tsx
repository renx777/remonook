import {CardDetailsButton} from './CardDetailsDialog';
import {cardDetails} from './card-details.mjs';
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {NoteMetadataContext,type MetadataContext} from './NoteMetadataContext';
import {LayoutGrid,List,ListTree,Table2,ExternalLink,ArrowUpRight,Plus,ArrowUpDown,Filter,ListChecks,Settings2,Rows3,ChevronDown,Pencil,Trash2,X,Link2,Columns3,CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {mediaLinks} from './media.mjs';
import {snapshotIndex} from './outline-snapshot.mjs';
import {useImageUrl} from './ImageTools';
import {PreviewImage,useLinkPreview} from './LinkPreview';
import {previewPrice} from './link-preview-client';
import './traits-block.css';
import {loadLinkPreview} from './link-preview-client';
import {newSmartCollectionItem,smartMembers,traitBulletIds,sourcePath,dateTraitKeys,dateOf,calendarMonth,monthGrid,shiftMonth,boardColumns,TOTALS,traitTotal} from './traits-block.mjs';
import {traitImageRow,FILTER_OPS,setNoteTrait,itemLink,applyPreviewTraits,switchTraitTab,addTraitTab,renameTraitTab,deleteTraitTab,imageTraitNames,noteTraits,ratingOf,ratingText,setTraitValue,groupCollection,collectionTraitKeys,noteTrait,traitCover,isTraitsBlock,isUrl,traitView,setTraitView,arrangeCollection,shownTraits} from './traits-block.mjs';
import type {Node,Workspace} from './data';
import './bullet-collection.css';
const VIEWS=[['outline','Outline',ListTree],['grid','Grid',LayoutGrid],['list','Compact list',List],['table','Table',Table2]] as const;// Board and Calendar layouts are held back from this release.
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
type ItemProps={doc:Workspace;node:Node;assets:Map<string,Blob>;onOpen:(id:string)=>void;childCount:number;traitKeys:string[];links:boolean;cover:string;source?:boolean};
/** A rating trait as stars; tapping a star sets it (tapping the current one clears it). */
function Stars({doc,node,k}:{doc:Workspace;node:Node;k:string}){
 const ctx=useContext(NoteMetadataContext),row=noteTraits(doc,node.mirrorSourceId||node.id).find((t:any)=>!t.duplicate&&t.key.toLocaleLowerCase()===k.toLocaleLowerCase());
 const r=row?ratingOf(row.key,row.value):null;if(!row||!r)return null;const off=!ctx?.save||ctx.disabled;
 const set=(n:number)=>{if(!off)void ctx!.save!(d=>setTraitValue(d,row.id,ratingText(n===r.value?0:n,row.value))).catch(()=>{});};
 return <span className="trait-stars" role="group" aria-label={`${row.key}: ${r.value} of ${r.max}`}>{Array.from({length:r.max},(_,i)=><button type="button" key={i} disabled={off} aria-label={`${i+1} of ${r.max}`} aria-pressed={i<r.value} onClick={e=>{e.stopPropagation();set(i+1);}}>{i<Math.round(r.value)?'★':'☆'}</button>)}</span>;
}
const isRating=(doc:Workspace,node:Node,k:string)=>{const v=noteTrait(doc,node.mirrorSourceId||node.id,k);return v!==null&&!!ratingOf(k,v);};
function TraitCell({doc,node,k}:{doc:Workspace;node:Node;k:string}){const v=noteTrait(doc,node.mirrorSourceId||node.id,k);if(v!==null&&ratingOf(k,v))return <Stars doc={doc} node={node} k={k}/>;if(!v)return <>—</>;if(isUrl(v))return <a className="trait-url" href={v} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{v.replace(/^https?:\/\/(www\.)?/,'')}</a>;return <>{v}</>;}
function PosterCard({doc,node,assets,onOpen,traitKeys,cover,source}:ItemProps){
 const item=useItem(doc,node,assets,cover),id=node.mirrorSourceId||node.id;
 const shown=traitKeys.filter(k=>!(item.image&&k.toLocaleLowerCase()===String(cover).toLocaleLowerCase())).map(k=>[k,noteTrait(doc,id,k)] as const).filter(([k,v])=>v!==null&&(isRating(doc,node,k)||(v&&!isUrl(v)))).slice(0,4);
 return <article ref={item.root} className="poster-card">
  <button type="button" className="poster-image" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}>{cover!=='none'&&<PreviewImage src={item.image} title={item.title}/>}</button>
  <div className="poster-copy"><button type="button" className="poster-title" title={item.title} onClick={()=>onOpen(node.id)}>{item.title}</button>{source&&<small className="smart-source">{sourcePath(doc,node.id)}</small>}
   {shown.map(([k,v])=><div key={k} className="poster-trait"><span>{k}</span>{isRating(doc,node,k)?<Stars doc={doc} node={node} k={k}/>:<strong>{v}</strong>}</div>)}</div>
 </article>;
}
function CollectionCard({doc,node,assets,onOpen,childCount,traitKeys,cover,source}:ItemProps){
 const item=useItem(doc,node,assets,cover),[imageFailed,setImageFailed]=useState(false);useEffect(()=>setImageFailed(false),[item.image]);
 return <article ref={item.root} className={'collection-card'+(item.url||item.image?' has-cover':'')}>
  {((item.image&&!imageFailed)||item.loading)&&<button className="collection-cover" type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><PreviewImage src={item.image} title={item.title} onUnavailable={()=>setImageFailed(true)}/></button>}
  <div className="collection-card-copy"><span className="collection-site">{item.site||'Note'}</span><button type="button" className="collection-title" onClick={()=>onOpen(node.id)}>{item.title}</button>{source&&<small className="smart-source">{sourcePath(doc,node.id)}</small>}{item.description&&<p>{item.description}</p>}
   {traitKeys.length>0&&<dl className="collection-traits">{traitKeys.filter(k=>!(item.image&&k.toLocaleLowerCase()===String(cover).toLocaleLowerCase())&&!isUrl(noteTrait(doc,node.mirrorSourceId||node.id,k)||'x')).slice(0,4).filter(k=>noteTrait(doc,node.mirrorSourceId||node.id,k)).map(k=><div key={k}><dt>{k}</dt><dd><TraitCell doc={doc} node={node} k={k}/></dd></div>)}</dl>}
   {item.price&&<><strong className="collection-price" title={item.details?.amount?'Your entered price':'Page preview · prices may change'}>{item.price}</strong><small className="collection-price-source">{item.details?.amount?'Your price':'Website preview'}</small></>}
   <footer>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">Open website <ExternalLink size={12}/></a>:<span>{childCount?childCount+' nested '+(childCount===1?'note':'notes'):'Text note'}</span>}<span className="collection-card-actions">{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={14}/></button></span></footer>
   {item.details&&<small className="collection-status">Your details{item.details.amount?' · entered price':''}</small>}{item.error&&!item.details&&<small className="collection-status">Preview unavailable · link kept</small>}{item.loading&&item.url&&<small className="collection-status" role="status">Loading preview…</small>}
  </div>
 </article>;
}
function CollectionTableRow({doc,node,assets,onOpen,traitKeys,links,cover,source}:ItemProps){
 const item=useItem(doc,node,assets,cover);
 return <tr><td><div ref={item.root} className="collection-table-item"><div className="collection-table-thumbnail"><PreviewImage src={item.image} title={item.title}/></div><div><button className="collection-title" type="button" onClick={()=>onOpen(node.id)}>{item.title}</button>{source&&<small className="smart-source">{sourcePath(doc,node.id)}</small>}{item.error&&<small>Preview unavailable · link kept</small>}{item.loading&&item.url&&<small role="status">Loading…</small>}</div></div></td>{traitKeys.map(k=><td key={k}><EditableCell doc={doc} node={node} k={k}/></td>)}{links&&<><td>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.site}<ExternalLink size={11}/></a>:'Note'}</td><td>{item.price||'—'}{item.details?.amount&&<small className="collection-status">Your price</small>}</td><td>{item.data?.availability||'—'}</td></>}<td>{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" className="collection-open" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={15}/></button></td></tr>;
}
async function addCollectionNote(ctx:MetadataContext|null,parent:string,names:string[],onOpen:(id:string)=>void){
 if(!ctx?.save||ctx.disabled)return;let id='';await ctx.save(d=>{const r=newSmartCollectionItem(d,parent,names);id=r.id;return r.doc;});if(id)onOpen(id);
}
export function BulletCollection({doc,nodes:all,mode,assets,onOpen,onAdd,parentId}:{doc:Workspace;parentId?:string;nodes:Node[];mode:string;assets:Map<string,Blob>;onOpen:(id:string)=>void;onAdd?:()=>void}){
 const metadata=useContext(NoteMetadataContext),[addError,setAddError]=useState('');
 const [paging,setPaging]=useState({key:'',limit:24}),idx=useMemo(()=>snapshotIndex(doc.tables.bullets),[doc.tables.bullets]);
 // A Traits block describes the collection itself, so it is not one of its items.
 const parent=parentId||all[0]?.parentId||'';
 const view=(parent?traitView(doc,parent):traitView(doc,'')) as unknown as View;
 const pageKey=JSON.stringify([parent,mode,view.active,view.source,view.sourceBranch,view.filterKey,view.filter,view.conditions,view.match]),limit=paging.key===pageKey?paging.limit:24;
 const members=useMemo(()=>parentId?smartMembers(doc,parentId,view):all.filter(n=>!isTraitsBlock(n)),[doc.tables.bullets,doc.tables.media,parentId,all,view.source,view.sourceBranch]);
 const available=useMemo(()=>collectionTraitKeys(doc,members.map(n=>n.mirrorSourceId||n.id),idx),[doc,members,idx]);
 const imageNames=useMemo(()=>imageTraitNames(doc,members.map(n=>n.mirrorSourceId||n.id),idx).filter((k:string)=>!available.some(a=>a.toLocaleLowerCase()===k.toLocaleLowerCase())),[doc,members,idx,available]);
 const [closed,setClosed]=useState<Set<string>>(new Set());

 const nodes:Node[]=useMemo(()=>arrangeCollection(doc,members,view,idx) as Node[],[doc,members,idx,JSON.stringify(view)]);
 const traitKeys:string[]=shownTraits(view,available);
 const smartAdd=!!parentId&&(view.source!=='children'||!!view.recipe||available.length>0),add=smartAdd?()=>{setAddError('');void addCollectionNote(metadata,parent,available,onOpen).catch(e=>setAddError(e.message));}:onAdd;
 const sourceUnavailable=view.source==='branch'&&(!idx.byId.has(view.sourceBranch)||traitBulletIds(doc.tables.bullets).has(idx.byId.get(view.sourceBranch)?.mirrorSourceId||view.sourceBranch));
 const links=useMemo(()=>!available.length||members.some(n=>mediaLinks(n.text).length>0),[members,available]);
 const items=nodes.slice(0,limit),props=(node:Node)=>({doc,node,assets,onOpen,childCount:(idx.children.get(node.id)||[]).filter((c:any)=>!isTraitsBlock(c)).length,traitKeys,links,cover:view.cover,source:view.source!=='children'});
 const dateKeys:string[]=useMemo(()=>dateTraitKeys(doc,members.map(n=>n.mirrorSourceId||n.id),idx),[doc,members,idx]);
 const renderItems=(list:Node[])=>mode==='board'?<Board doc={doc} parent={parent} view={view} available={available} items={list} assets={assets} onOpen={onOpen}/>
  :mode==='calendar'?<TraitCalendar doc={doc} view={view} dateKeys={dateKeys} items={list} onOpen={onOpen}/>
  :mode==='table'?<div className="collection-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table><caption className={links?undefined:'sr-only'}>{links?'Child notes and page previews. Prices are captured page data and may change.':'Items and their traits'}</caption><thead><tr><th scope="col">Item</th>{traitKeys.map(k=><th scope="col" key={k}>{k}</th>)}{links&&<><th scope="col">Website</th><th scope="col">Price</th><th scope="col">Availability</th></>}<th scope="col"><span className="sr-only">Open note</span></th></tr></thead><tbody>{list.map(node=><CollectionTableRow key={node.id} {...props(node)}/>)}</tbody>{available.length>0&&<Totals doc={doc} parent={parent} view={view} keys={traitKeys} items={list} links={links}/>}</table></div>
  :mode==='grid'&&available.length>0?<div className="poster-grid" style={{'--card':view.cardSize+'px','--ratio':String(view.ratio),'--fit':view.fit} as React.CSSProperties}>{list.map(node=><PosterCard key={node.id} {...props(node)}/>)}</div>
  :<div className="collection-items">{list.map(node=><CollectionCard key={node.id} {...props(node)}/>)}</div>;
 return <div className={'bullet-collection collection-'+mode}>
  {parent&&(parentId||available.length>0)?<CollectionBar parent={parent} view={view} available={available} imageNames={imageNames} dateKeys={dateKeys} mode={mode} count={nodes.length} total={members.length} onAdd={onAdd} onOpen={onOpen} items={members}/>
  :<div className="collection-toolbar"><span>{members.length} {members.length===1?'item':'items'}</span>{onAdd&&<button type="button" onClick={onAdd}><Plus size={14}/>Add note or link</button>}</div>}
  {sourceUnavailable&&<p role="status">Choose an ordinary source branch in Configure. This view has no results until then.</p>}{addError&&<p role="alert">{addError}</p>}
  {members.length>0&&nodes.length===0&&<p role="status">No notes match this view. Adjust its filters or fill the new item’s Traits.</p>}
  {!members.length&&<div className="collection-empty"><LayoutGrid size={25}/><p>A little room for a collection.</p><small>Add child notes or paste website links, then choose how to see them.</small>{add&&<button type="button" disabled={!!metadata?.disabled||smartAdd&&!metadata?.save} onClick={add}>Add your first item</button>}</div>}
  {nodes.length>0&&(view.group&&mode!=='board'&&mode!=='calendar'?groupCollection(doc,items,view.group,view.groupDir,idx).map((g:{label:string;items:Node[]})=>{const key=g.label.toLocaleLowerCase()||'\u0000';const isClosed=closed.has(key);
    return <section key={key} className="collection-group"><button type="button" className="collection-group-head" aria-expanded={!isClosed} onClick={()=>setClosed(c=>{const n=new Set(c);if(n.has(key))n.delete(key);else n.add(key);return n;})}><ChevronDown size={14} className={isClosed?'is-closed':''}/><span>{g.label||'No '+view.group}</span><small>{g.items.length}</small></button>{!isClosed&&renderItems(g.items)}</section>;})
   :renderItems(items))}
  {nodes.length>limit&&<button className="collection-more" type="button" onClick={()=>setPaging({key:pageKey,limit:limit+24})}>Show {Math.min(24,nodes.length-limit)} more · {nodes.length-limit} remaining</button>}
  {nodes.length>0&&<p className="collection-footnote">Your original notes, in a different view. Website details may be unavailable or change.</p>}
 </div>;
}

type Tab={id:string;name:string;settings:any};type Cond={key:string;op:string;value:string};
type View=Omit<ReturnType<typeof traitView>,"tabs"|"conditions"|"match">&{tabs:Tab[];conditions:Cond[];match:"all"|"any";active:string};
/** Obsidian-style bar: result count, then Sort, Filter, Properties, Configure and New, each a small panel. */
function CollectionBar({parent,view,available,imageNames,dateKeys,mode,count,total,onAdd,onOpen,items}:{parent:string;view:View;available:string[];imageNames:string[];dateKeys:string[];mode:string;count:number;total:number;onAdd?:()=>void;onOpen:(id:string)=>void;items:Node[]}){
 const ctx=useContext(NoteMetadataContext),[open,setOpen]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState(view.filter),root=useRef<HTMLDivElement>(null);
 useEffect(()=>setFilter(view.filter),[view.filter]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as globalThis.Node))setOpen('');};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen('');};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[open]);
 const set=(patch:Partial<View>)=>{setError('');if(!ctx?.save)return;void ctx.save(d=>setTraitView(d,parent,patch)).catch((e:Error)=>setError(e.message));};
 const run=(fn:(d:Workspace)=>Workspace)=>{setError('');if(!ctx?.save)return Promise.resolve();return ctx.save(fn).catch((e:Error)=>setError(e.message));};
 // New item: an empty title with this collection's trait names ready to fill, opened at once.
 const newItem=()=>{setError('');void addCollectionNote(ctx,parent,available,onOpen).catch(e=>setError(e.message));};
 // Fill from links: each item's page preview adds the traits it is missing (never overwrites).
 const [filling,setFilling]=useState('');
 const fill=async()=>{const doc=ctx?.doc;if(!doc)return;const targets=items.map(n=>({id:n.mirrorSourceId||n.id,url:itemLink(doc,n.mirrorSourceId||n.id,n.text)})).filter(t=>t.url).slice(0,60);
  if(!targets.length){setFilling('No item has a link yet. Put a link in an item\'s title or a Link trait.');return;}
  let done=0,failed=0;for(const t of targets){setFilling(`Reading ${done+failed+1} of ${targets.length}…`);try{const p=await loadLinkPreview(t.url!);await run(d=>applyPreviewTraits(d,t.id,p));done++;}catch{failed++;}}
  setFilling(`Filled ${done} of ${targets.length}${failed?` · ${failed} could not be read`:''}.`);};
 const [branchSearch,setBranchSearch]=useState('');
 const branchChoices=useMemo(()=>{const doc=ctx?.doc;if(!doc)return [];const hidden=traitBulletIds(doc.tables.bullets);const selected=doc.tables.bullets.find(n=>n.id===view.sourceBranch);return [...(selected?[selected]:[]),...doc.tables.bullets.filter(n=>n.id!==view.sourceBranch&&!n.mirrorSourceId&&!hidden.has(n.id)&&n.text.toLocaleLowerCase().includes(branchSearch.toLocaleLowerCase())).slice(0,100)];},[ctx?.doc?.tables.bullets,view.sourceBranch,branchSearch]);
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
  <p className="collection-scope"><span className="collection-count">{count===total?total:count+' of '+total} {total===1?'result':'results'}</span> from <button type="button" className="scope-chip" aria-label="Change where results come from" onClick={()=>setOpen(open==='config'?'':'config')}>{view.source==='workspace'?'the whole workspace':view.source==='branch'?(view.sourceBranch&&ctx?(()=>{const n=ctx.doc.tables.bullets.find((b:any)=>b.id===view.sourceBranch) as Node|undefined;return 'inside '+(n?.text||'a branch').slice(0,40);})():'a branch — choose one'):'this note’s children'}</button>
   {conds.length>0&&<> where {conds.slice(0,2).map((c,i)=><span key={i}>{i>0&&(view.match==='any'?' or ':' and ')}<button type="button" className="scope-chip" onClick={()=>setOpen(open==='filter'?'':'filter')}>{c.key==='title'?'Title':c.key} {(FILTER_OPS.find(([k])=>k===c.op)?.[1]||c.op)}{c.op!=='empty'&&c.op!=='notempty'&&c.value?` “${String(c.value).slice(0,24)}”`:''}</button></span>)}{conds.length>2&&<button type="button" className="scope-chip" onClick={()=>setOpen('filter')}>+{conds.length-2} more</button>}</>}
   {view.filter&&<> matching <button type="button" className="scope-chip" onClick={()=>setOpen('filter')}>“{view.filter.slice(0,24)}”</button></>}</p></div>
  <div className="collection-bar-actions">
   {tab('sort','Sort',ArrowUpDown,!!view.sort)}{tab('group','Group',Rows3,!!view.group)}{tab('filter','Filter',Filter,!!view.filter)}{tab('props','Properties',ListChecks)}{tab('config','Configure',Settings2)}
   {(onAdd||available.length>0)&&<button type="button" aria-label={available.length||view.recipe||view.source!=='children'?'New item':'Add note or link'} title="New item" disabled={off} onClick={available.length||view.recipe||view.source!=='children'?newItem:onAdd}><Plus size={14}/><span>New</span></button>}
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
    <label>Notes from<select aria-label="Collection source" value={view.source} disabled={off} onChange={e=>set({source:e.target.value as View['source']})}><option value="children">Direct children</option><option value="branch">A note branch</option><option value="workspace">Current workspace</option></select></label>
    {view.source==='branch'&&<><label>Find branch<input aria-label="Find collection branch" value={branchSearch} onChange={e=>setBranchSearch(e.target.value)}/></label><label>Branch<select aria-label="Collection branch" value={view.sourceBranch} disabled={off} onChange={e=>set({sourceBranch:e.target.value})}><option value="">Choose a branch</option>{branchChoices.map(n=><option key={n.id} value={n.id}>{sourcePath(ctx!.doc,n.id)} / {n.text||'Untitled'}</option>)}</select></label></>}
    <label>Trait recipe for new items<select aria-label="New item Trait recipe" value={view.recipe} disabled={off} onChange={e=>set({recipe:e.target.value})}><option value="">Use this collection’s Trait names</option><option value="book">Book shelf</option><option value="movie">Movie shelf</option><option value="project">Projects</option></select></label><small>Recipes add ordinary Trait bullets to new items. Existing notes stay as they are.</small>
    {mode==='board'&&<label>Columns from<select aria-label="Board columns from" value={view.boardKey||view.group||available[0]||''} disabled={off} onChange={e=>set({boardKey:e.target.value})}>{options}</select></label>}
    {mode==='calendar'&&<label>Date trait<select aria-label="Calendar date trait" value={view.dateKey||dateKeys[0]||''} disabled={off} onChange={e=>set({dateKey:e.target.value})}>{dateKeys.length?dateKeys.map(k=><option key={k} value={k}>{k}</option>):<option value="">No trait holds a date yet</option>}</select></label>}
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

/** Board: a column per value of a trait. Drag a card to another column (or use Move to) to change it. */
function Board({doc,parent,view,available,items,assets,onOpen}:{doc:Workspace;parent:string;view:View;available:string[];items:Node[];assets:Map<string,Blob>;onOpen:(id:string)=>void}){
 const ctx=useContext(NoteMetadataContext),off=!ctx?.save||ctx.disabled,key=view.boardKey||view.group||available[0]||'';
 const [over,setOver]=useState<string|null>(null),[adding,setAdding]=useState(''),[error,setError]=useState('');
 if(!key)return <p className="collection-hint">Add a trait to the items (for example <code>Status: Watching</code>) to sort them into columns.</p>;
 const cols:{label:string;items:Node[]}[]=boardColumns(doc,items,key,view.boardExtra);
 // Moving the last card out of a column keeps the column (it becomes an empty, removable one).
 const move=(id:string,label:string)=>{setError('');if(off)return;const from=cols.find(c=>c.items.some(n=>(n.mirrorSourceId||n.id)===id));
  const keep=from&&from.label&&from.items.length===1&&from.label.toLocaleLowerCase()!==label.toLocaleLowerCase()&&!view.boardExtra.some(x=>x.toLocaleLowerCase()===from.label.toLocaleLowerCase());
  void ctx!.save!(d=>{const next=setNoteTrait(d,id,key,label);return keep?setTraitView(next,parent,{boardExtra:[...view.boardExtra,from!.label]}):next;}).catch((e:Error)=>setError(e.message));};
 const addColumn=()=>{const n=adding.trim();if(!n||off)return;void ctx!.save!(d=>setTraitView(d,parent,{boardExtra:[...view.boardExtra,n]})).then(()=>setAdding('')).catch((e:Error)=>setError(e.message));};
 return <div className="trait-board" role="list" aria-label={'Board by '+key}>
  {cols.map(c=>{const k=c.label.toLocaleLowerCase()||'\u0000';const extra=!c.items.length&&view.boardExtra.some(x=>x.toLocaleLowerCase()===c.label.toLocaleLowerCase());
   return <section key={k} role="listitem" className={'board-column'+(over===k?' is-over':'')} aria-label={(c.label||'No '+key)+', '+c.items.length}
    onDragOver={e=>{if(off)return;e.preventDefault();setOver(k);}} onDragLeave={()=>setOver(o=>o===k?null:o)} onDrop={e=>{e.preventDefault();setOver(null);const id=e.dataTransfer.getData('text/remonook-item');if(id)move(id,c.label);}}>
    <header><span>{c.label||'No '+key}</span><small>{c.items.length}</small>{extra&&<button type="button" className="collection-tab-icon" aria-label={'Remove column '+c.label} disabled={off} onClick={()=>void ctx!.save!(d=>setTraitView(d,parent,{boardExtra:view.boardExtra.filter(x=>x.toLocaleLowerCase()!==c.label.toLocaleLowerCase())}))}><X size={12}/></button>}</header>
    <div className="board-cards">{c.items.map(n=><BoardCard key={n.id} doc={doc} node={n} assets={assets} cover={view.cover} keys={shownTraits(view,available).filter((x:string)=>x.toLocaleLowerCase()!==key.toLocaleLowerCase()).slice(0,3)} columns={cols.map(x=>x.label)} current={c.label} traitKey={key} disabled={off} onOpen={onOpen} onMove={label=>move(n.mirrorSourceId||n.id,label)}/>)}
     {!c.items.length&&<p className="board-empty">Drop cards here</p>}</div>
   </section>;})}
  <section className="board-column board-add"><form onSubmit={e=>{e.preventDefault();addColumn();}}><input aria-label="New column" placeholder={'New '+key+'…'} maxLength={60} value={adding} disabled={off} onChange={e=>setAdding(e.target.value)}/><button type="submit" disabled={off||!adding.trim()} aria-label="Add column"><Plus size={14}/></button></form></section>
  {error&&<span role="alert" className="trait-error">{error}</span>}
 </div>;
}
function BoardCard({doc,node,assets,cover,keys,columns,current,traitKey,disabled,onOpen,onMove}:{doc:Workspace;node:Node;assets:Map<string,Blob>;cover:string;keys:string[];columns:string[];current:string;traitKey:string;disabled:boolean;onOpen:(id:string)=>void;onMove:(label:string)=>void}){
 const item=useItem(doc,node,assets,cover),id=node.mirrorSourceId||node.id;
 return <article ref={item.root} className="board-card" draggable={!disabled} onDragStart={e=>{e.dataTransfer.setData('text/remonook-item',id);e.dataTransfer.effectAllowed='move';}}>
  {item.image&&cover!=='none'&&<button type="button" className="board-card-image" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><PreviewImage src={item.image} title={item.title}/></button>}
  <button type="button" className="poster-title" onClick={()=>onOpen(node.id)}>{item.title}</button>
  {keys.map(k=>{const v=noteTrait(doc,id,k);if(v===null||(!v&&!isRating(doc,node,k)))return null;return <div key={k} className="poster-trait"><span>{k}</span>{isRating(doc,node,k)?<Stars doc={doc} node={node} k={k}/>:<strong>{isUrl(v)?v.replace(/^https?:\/\/(www\.)?/,''):v}</strong>}</div>;})}
  <label className="board-move"><span className="sr-only">Move {item.title} to</span><select aria-label={'Move '+item.title+' to'} value={current} disabled={disabled} onChange={e=>onMove(e.target.value)}>{columns.map(c=><option key={c||'none'} value={c}>{c||'No '+traitKey}</option>)}</select></label>
 </article>;
}
/** Calendar: items on the date in a date trait, one month at a time. */
function TraitCalendar({doc,view,dateKeys,items,onOpen}:{doc:Workspace;view:View;dateKeys:string[];items:Node[];onOpen:(id:string)=>void}){
 const key=dateKeys.find(k=>k.toLocaleLowerCase()===view.dateKey.toLocaleLowerCase())||dateKeys[0]||'';
 const today=new Date(),todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const [month,setMonth]=useState(todayStr.slice(0,7));
 if(!key)return <p className="collection-hint">Add a date trait to the items (for example <code>Watched: 2026-11-20</code>) to see them on a calendar.</p>;
 const {days,undated}=calendarMonth(doc,items,key,month);const grid:string[]=monthGrid(month);
 const label=new Date(month+'-01T00:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const agenda=[...days.entries()].sort(([a],[b])=>a.localeCompare(b)) as [string,Node[]][];
 const title=(n:Node)=>String(n.text||'').split('\n')[0].replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').trim()||'Untitled';
 return <div className="trait-calendar">
  <header><button type="button" aria-label="Previous month" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={16}/></button><h3>{label}</h3><button type="button" aria-label="Next month" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={16}/></button>
   {month!==todayStr.slice(0,7)&&<button type="button" className="calendar-today" onClick={()=>setMonth(todayStr.slice(0,7))}>Today</button>}<small>By {key}{undated?` · ${undated} without a date`:''}</small></header>
  <div className="calendar-grid" role="grid" aria-label={label}>
   {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d} className="calendar-weekday" role="columnheader">{d}</div>)}
   {grid.map(d=>{const list:Node[]=days.get(d)||[];return <div key={d} role="gridcell" className={'calendar-cell'+(d.slice(0,7)!==month?' is-outside':'')+(d===todayStr?' is-today':'')} aria-label={d+(list.length?', '+list.length+' items':'')}>
    <span className="calendar-day">{Number(d.slice(8))}</span>
    {list.slice(0,3).map((n:Node)=><button type="button" key={n.id} className="calendar-chip" title={title(n)} onClick={()=>onOpen(n.id)}>{title(n)}</button>)}
    {list.length>3&&<small className="calendar-more">+{list.length-3} more</small>}</div>;})}
  </div>
  <ol className="calendar-agenda" aria-label={'Items in '+label}>{agenda.length?agenda.map(([d,list])=><li key={d}><span>{new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</span>{list.map(n=><button type="button" key={n.id} onClick={()=>onOpen(n.id)}>{title(n)}</button>)}</li>):<li className="calendar-none">Nothing this month.</li>}</ol>
 </div>;
}
/** A summary row under the table: choose Filled, Sum, Average… per trait column. */
function Totals({doc,parent,view,keys,items,links}:{doc:Workspace;parent:string;view:View;keys:string[];items:Node[];links:boolean}){
 const ctx=useContext(NoteMetadataContext),off=!ctx?.save||ctx.disabled,totals=(view.totals||{}) as Record<string,string>;
 const set=(k:string,op:string)=>{if(off)return;const next={...totals};if(op)next[k]=op;else delete next[k];void ctx!.save!(d=>setTraitView(d,parent,{totals:next})).catch(()=>{});};
 return <tfoot><tr><th scope="row" className="totals-label">Summary</th>{keys.map(k=>{const op=totals[k]||'';return <td key={k}><label className="trait-total"><select aria-label={'Summary for '+k} value={op} disabled={off} onChange={e=>set(k,e.target.value)}>{TOTALS.map(([o,l])=><option key={o} value={o}>{l}</option>)}</select>{op&&<strong>{traitTotal(doc,items,k,op)}</strong>}</label></td>;})}{links&&<><td/><td/><td/></>}<td/></tr></tfoot>;
}
