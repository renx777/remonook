import {CardDetailsButton} from './CardDetailsDialog';
import {cardDetails} from './card-details.mjs';
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {LayoutGrid,List,ListTree,Table2,ExternalLink,ArrowUpRight,Plus,ArrowUpDown,Filter,ListChecks,Settings2} from 'lucide-react';
import {mediaLinks} from './media.mjs';
import {snapshotIndex} from './outline-snapshot.mjs';
import {useImageUrl} from './ImageTools';
import {PreviewImage,useLinkPreview} from './LinkPreview';
import {previewPrice} from './link-preview-client';
import './traits-block.css';
import {collectionTraitKeys,noteTrait,traitCover,isTraitsBlock,isUrl,traitView,setTraitView,arrangeCollection,shownTraits} from './traits-block.mjs';
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
 const label=node.text.replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/https?:\/\/[^\s<>"']+/g,'').trim();
 const details=url?cardDetails(doc,node.id,url):null;
 const title=details?.title||(label?label.split('\n')[0]:'')||preview.data?.title||(url?new URL(url).hostname.replace(/^www\./,''):'Untitled');
 // A cover trait the collection chose wins; "none" hides covers; automatic keeps link previews first.
 const chosen=cover!=='auto'&&cover!=='none'?traitCover(doc,node.mirrorSourceId||node.id,cover):null;
 const image=cover==='none'?null:chosen||details?.image||local||(link?.kind==='image'?url:preview.data?.image)||traitCover(doc,node.mirrorSourceId||node.id)||null;
 return {...preview,url,title,image,site:preview.data?.site||(url?new URL(url).hostname.replace(/^www\./,''):''),details,price:previewPrice(details?.amount?{amount:details.amount,currency:details.currency,from:false}:preview.data?.price||null),description:details?.description||preview.data?.description||(!url?node.text.split('\n').slice(1).join('\n'):'')};
}
type ItemProps={doc:Workspace;node:Node;assets:Map<string,Blob>;onOpen:(id:string)=>void;childCount:number;traitKeys:string[];links:boolean;cover:string};
function TraitCell({doc,node,k}:{doc:Workspace;node:Node;k:string}){const v=noteTrait(doc,node.mirrorSourceId||node.id,k);if(!v)return <>—</>;if(isUrl(v))return <a className="trait-url" href={v} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{v.replace(/^https?:\/\/(www\.)?/,'')}</a>;return <>{v}</>;}
function PosterCard({doc,node,assets,onOpen,traitKeys,cover}:ItemProps){
 const item=useItem(doc,node,assets,cover),id=node.mirrorSourceId||node.id;
 const shown=traitKeys.filter(k=>!(item.image&&k.toLocaleLowerCase()===String(cover).toLocaleLowerCase())).map(k=>[k,noteTrait(doc,id,k)] as const).filter(([,v])=>v&&!isUrl(v)).slice(0,4);
 return <article ref={item.root} className="poster-card">
  <button type="button" className="poster-image" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}>{cover!=='none'&&<PreviewImage src={item.image} title={item.title}/>}</button>
  <div className="poster-copy"><button type="button" className="poster-title" title={item.title} onClick={()=>onOpen(node.id)}>{item.title}</button>
   {shown.map(([k,v])=><div key={k} className="poster-trait"><span>{k}</span><strong>{v}</strong></div>)}</div>
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
 return <tr><td><div ref={item.root} className="collection-table-item"><div className="collection-table-thumbnail"><PreviewImage src={item.image} title={item.title}/></div><div><button className="collection-title" type="button" onClick={()=>onOpen(node.id)}>{item.title}</button>{item.error&&<small>Preview unavailable · link kept</small>}{item.loading&&item.url&&<small role="status">Loading…</small>}</div></div></td>{traitKeys.map(k=><td key={k}><TraitCell doc={doc} node={node} k={k}/></td>)}{links&&<><td>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.site}<ExternalLink size={11}/></a>:'Note'}</td><td>{item.price||'—'}{item.details?.amount&&<small className="collection-status">Your price</small>}</td><td>{item.data?.availability||'—'}</td></>}<td>{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" className="collection-open" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={15}/></button></td></tr>;
}
export function BulletCollection({doc,nodes:all,mode,assets,onOpen,onAdd}:{doc:Workspace;nodes:Node[];mode:string;assets:Map<string,Blob>;onOpen:(id:string)=>void;onAdd?:()=>void}){
 const [limit,setLimit]=useState(24),idx=useMemo(()=>snapshotIndex(doc.tables.bullets),[doc.tables.bullets]);
 // A Traits block describes the collection itself, so it is not one of its items.
 const members=useMemo(()=>all.filter(n=>!isTraitsBlock(n)&&(n.text.trim()||(idx.children.get(n.id)||[]).length>0||doc.tables.media.some(m=>m.bulletId===(n.mirrorSourceId||n.id)))),[all,idx,doc.tables.media]),parent=members[0]?.parentId||all[0]?.parentId||'';
 const available=useMemo(()=>collectionTraitKeys(doc,members.map(n=>n.mirrorSourceId||n.id),idx),[doc,members,idx]);
 const view=parent?traitView(doc,parent):traitView(doc,'');
 const nodes:Node[]=useMemo(()=>arrangeCollection(doc,members,view,idx) as Node[],[doc,members,idx,JSON.stringify(view)]);
 const traitKeys:string[]=shownTraits(view,available);
 const links=useMemo(()=>!available.length||members.some(n=>mediaLinks(n.text).length>0),[members,available]);
 useEffect(()=>setLimit(24),[nodes[0]?.parentId,mode]);
 const items=nodes.slice(0,limit),props=(node:Node)=>({doc,node,assets,onOpen,childCount:(idx.children.get(node.id)||[]).filter((c:any)=>!isTraitsBlock(c)).length,traitKeys,links,cover:view.cover});
 return <div className={'bullet-collection collection-'+mode}>
  {parent&&available.length>0?<CollectionBar parent={parent} view={view} available={available} mode={mode} count={nodes.length} total={members.length} onAdd={onAdd}/>
  :<div className="collection-toolbar"><span>{members.length} {members.length===1?'item':'items'}</span>{onAdd&&<button type="button" onClick={onAdd}><Plus size={14}/>Add note or link</button>}</div>}
  {!members.length&&<div className="collection-empty"><LayoutGrid size={25}/><p>A little room for a collection.</p><small>Add child notes or paste website links, then choose how to see them.</small>{onAdd&&<button type="button" onClick={onAdd}>Add your first item</button>}</div>}
  {mode==='table'&&nodes.length>0?<div className="collection-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table><caption>Child notes and page previews. Prices are captured page data and may change.</caption><thead><tr><th scope="col">Item</th>{traitKeys.map(k=><th scope="col" key={k}>{k}</th>)}{links&&<><th scope="col">Website</th><th scope="col">Price</th><th scope="col">Availability</th></>}<th scope="col"><span className="sr-only">Open note</span></th></tr></thead><tbody>{items.map(node=><CollectionTableRow key={node.id} {...props(node)}/>)}</tbody></table></div>:(mode==='grid'&&available.length>0?<div className="poster-grid" style={{'--card':view.cardSize+'px','--ratio':String(view.ratio),'--fit':view.fit} as React.CSSProperties}>{items.map(node=><PosterCard key={node.id} {...props(node)}/>)}</div>
   :<div className="collection-items">{items.map(node=><CollectionCard key={node.id} {...props(node)}/>)}</div>)}
  {nodes.length>limit&&<button className="collection-more" type="button" onClick={()=>setLimit(value=>value+24)}>Show {Math.min(24,nodes.length-limit)} more · {nodes.length-limit} remaining</button>}
  {nodes.length>0&&<p className="collection-footnote">Your original notes, in a different view. Website details may be unavailable or change.</p>}
 </div>;
}

type View=ReturnType<typeof traitView>;
/** Obsidian-style bar: result count, then Sort, Filter, Properties, Configure and New, each a small panel. */
function CollectionBar({parent,view,available,mode,count,total,onAdd}:{parent:string;view:View;available:string[];mode:string;count:number;total:number;onAdd?:()=>void}){
 const ctx=useContext(NoteMetadataContext),[open,setOpen]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState(view.filter),root=useRef<HTMLDivElement>(null);
 useEffect(()=>setFilter(view.filter),[view.filter]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as globalThis.Node))setOpen('');};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen('');};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[open]);
 const set=(patch:Partial<View>)=>{setError('');if(!ctx?.save)return;void ctx.save(d=>setTraitView(d,parent,patch)).catch((e:Error)=>setError(e.message));};
 useEffect(()=>{if(filter===view.filter)return;const t=setTimeout(()=>set({filter}),350);return()=>clearTimeout(t);},[filter]);
 // Sliders show their value at once and save when let go (one undo step, not one per pixel).
 const [draft,setDraft]=useState<{cardSize?:number;ratio?:number}>({});useEffect(()=>setDraft({}),[view.cardSize,view.ratio]);
 const shown:string[]=shownTraits(view,available),off=!ctx?.save||ctx.disabled,same=(a:string,b:string)=>a.toLocaleLowerCase()===b.toLocaleLowerCase();
 const toggle=(k:string)=>set({fields:shown.some(x=>same(x,k))?shown.filter(x=>!same(x,k)):[...shown,k]});
 const tab=(key:string,label:string,Icon:any,active=false)=><button type="button" className={active?'is-active':''} aria-label={label} title={label} aria-expanded={open===key} onClick={()=>setOpen(open===key?'':key)}><Icon size={14}/><span>{label}</span></button>;
 const options=available.map(k=><option key={k} value={k}>{k}</option>);
 return <div className="collection-bar" ref={root}>
  <span className="collection-count">{count===total?total:count+' of '+total} {total===1?'result':'results'}</span>
  <div className="collection-bar-actions">
   {tab('sort','Sort',ArrowUpDown,!!view.sort)}{tab('filter','Filter',Filter,!!view.filter)}{tab('props','Properties',ListChecks)}{tab('config','Configure',Settings2)}
   {onAdd&&<button type="button" aria-label="New item" title="New item" onClick={onAdd}><Plus size={14}/><span>New</span></button>}
  </div>
  {open&&<div className="collection-panel" role="group" aria-label={{sort:'Sort',filter:'Filter',props:'Properties',config:'Configure view'}[open]}>
   {open==='sort'&&<><label>Sort by<select aria-label="Sort by" value={view.sort} disabled={off} onChange={e=>set({sort:e.target.value})}><option value="">Outline order</option><option value="title">Title</option>{options}</select></label>
    {view.sort&&<label>Order<select aria-label="Sort order" value={view.dir} disabled={off} onChange={e=>set({dir:e.target.value as 'asc'|'desc'})}><option value="asc">Ascending (A→Z, 1→9)</option><option value="desc">Descending (Z→A, 9→1)</option></select></label>}</>}
   {open==='filter'&&<><label>Trait<select aria-label="Filter trait" value={view.filterKey} disabled={off} onChange={e=>set({filterKey:e.target.value})}><option value="">Any trait or title</option>{options}</select></label>
    <label>Contains<input type="search" autoFocus aria-label="Filter text" placeholder="Type to filter" value={filter} disabled={off} onChange={e=>setFilter(e.target.value)}/></label></>}
   {open==='props'&&<div className="collection-props">{available.map(k=><label key={k}><input type="checkbox" disabled={off} checked={shown.some(x=>same(x,k))} onChange={()=>toggle(k)}/>{k}</label>)}</div>}
   {open==='config'&&<>
    {mode==='grid'&&<label>Card size <output>{draft.cardSize??view.cardSize}</output><input type="range" aria-label="Card size" min={140} max={420} step={10} value={draft.cardSize??view.cardSize} disabled={off} onChange={e=>setDraft({...draft,cardSize:+e.target.value})} onPointerUp={()=>draft.cardSize&&set({cardSize:draft.cardSize})} onKeyUp={()=>draft.cardSize&&set({cardSize:draft.cardSize})}/></label>}
    <label>Image property<select aria-label="Image property" value={view.cover} disabled={off} onChange={e=>set({cover:e.target.value})}><option value="auto">Automatic</option><option value="none">No image</option>{options}</select></label>
    {mode==='grid'&&<><label>Image fit<select aria-label="Image fit" value={view.fit} disabled={off} onChange={e=>set({fit:e.target.value as 'cover'|'contain'})}><option value="cover">Cover (fill and crop)</option><option value="contain">Contain (whole image)</option></select></label>
    <label>Image aspect ratio <output>{(draft.ratio??view.ratio).toFixed(2)}</output><input type="range" aria-label="Image aspect ratio" min={0.5} max={2} step={0.05} value={draft.ratio??view.ratio} disabled={off} onChange={e=>setDraft({...draft,ratio:+e.target.value})} onPointerUp={()=>draft.ratio&&set({ratio:draft.ratio})} onKeyUp={()=>draft.ratio&&set({ratio:draft.ratio})}/></label></>}
   </>}
  </div>}
  {error&&<span role="alert" className="trait-error">{error}</span>}
 </div>;
}
