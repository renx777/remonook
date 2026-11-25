import {CardDetailsButton} from './CardDetailsDialog';
import {cardDetails} from './card-details.mjs';
import {useContext,useEffect,useMemo,useState} from 'react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {LayoutGrid,List,ListTree,Table2,ExternalLink,ArrowUpRight,Plus,ArrowUpNarrowWide,ArrowDownWideNarrow,SlidersHorizontal} from 'lucide-react';
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
 const members=useMemo(()=>all.filter(n=>!isTraitsBlock(n)),[all]),parent=members[0]?.parentId||all[0]?.parentId||'';
 const available=useMemo(()=>collectionTraitKeys(doc,members.map(n=>n.mirrorSourceId||n.id),idx),[doc,members,idx]);
 const view=parent?traitView(doc,parent):traitView(doc,'');
 const nodes:Node[]=useMemo(()=>arrangeCollection(doc,members,view,idx) as Node[],[doc,members,idx,JSON.stringify(view)]);
 const traitKeys:string[]=shownTraits(view,available);
 const links=useMemo(()=>!available.length||members.some(n=>mediaLinks(n.text).length>0),[members,available]);
 useEffect(()=>setLimit(24),[nodes[0]?.parentId,mode]);
 const items=nodes.slice(0,limit),props=(node:Node)=>({doc,node,assets,onOpen,childCount:(idx.children.get(node.id)||[]).filter((c:any)=>!isTraitsBlock(c)).length,traitKeys,links,cover:view.cover});
 return <div className={'bullet-collection collection-'+mode}>
  {parent&&available.length>0&&<TraitViewBar parent={parent} view={view} available={available}/>}
  <div className="collection-toolbar"><span>{nodes.length===members.length?'':nodes.length+' of '}{members.length} {members.length===1?'item':'items'}</span>{onAdd&&<button type="button" onClick={onAdd}><Plus size={14}/>Add note or link</button>}</div>
  {!members.length&&<div className="collection-empty"><LayoutGrid size={25}/><p>A little room for a collection.</p><small>Add child notes or paste website links, then choose how to see them.</small>{onAdd&&<button type="button" onClick={onAdd}>Add your first item</button>}</div>}
  {mode==='table'&&nodes.length>0?<div className="collection-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table><caption>Child notes and page previews. Prices are captured page data and may change.</caption><thead><tr><th scope="col">Item</th>{traitKeys.map(k=><th scope="col" key={k}>{k}</th>)}{links&&<><th scope="col">Website</th><th scope="col">Price</th><th scope="col">Availability</th></>}<th scope="col"><span className="sr-only">Open note</span></th></tr></thead><tbody>{items.map(node=><CollectionTableRow key={node.id} {...props(node)}/>)}</tbody></table></div>:<div className="collection-items">{items.map(node=><CollectionCard key={node.id} {...props(node)}/>)}</div>}
  {nodes.length>limit&&<button className="collection-more" type="button" onClick={()=>setLimit(value=>value+24)}>Show {Math.min(24,nodes.length-limit)} more · {nodes.length-limit} remaining</button>}
  {nodes.length>0&&<p className="collection-footnote">Your original notes, in a different view. Website details may be unavailable or change.</p>}
 </div>;
}

/** View controls from the items' traits: which to show, sort, filter and the cover image. */
function TraitViewBar({parent,view,available}:{parent:string;view:ReturnType<typeof traitView>;available:string[]}){
 const ctx=useContext(NoteMetadataContext),[open,setOpen]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState(view.filter);
 useEffect(()=>setFilter(view.filter),[view.filter]);
 const set=(patch:any)=>{setError('');if(!ctx?.save)return;void ctx.save(d=>setTraitView(d,parent,patch)).catch((e:Error)=>setError(e.message));};
 const shown:string[]=shownTraits(view,available),off=!ctx?.save||ctx.disabled;
 const toggle=(k:string)=>set({fields:shown.some(x=>x.toLocaleLowerCase()===k.toLocaleLowerCase())?shown.filter(x=>x.toLocaleLowerCase()!==k.toLocaleLowerCase()):[...shown,k]});
 useEffect(()=>{if(filter===view.filter)return;const t=setTimeout(()=>set({filter}),400);return()=>clearTimeout(t);},[filter]);
 return <div className="trait-view-bar" role="group" aria-label="Arrange by traits">
  <label>Sort<select aria-label="Sort by" value={view.sort} disabled={off} onChange={e=>set({sort:e.target.value})}><option value="">Outline order</option><option value="title">Title</option>{available.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
  {view.sort&&<button type="button" disabled={off} aria-label={view.dir==='asc'?'Ascending, switch to descending':'Descending, switch to ascending'} onClick={()=>set({dir:view.dir==='asc'?'desc':'asc'})}>{view.dir==='asc'?<ArrowUpNarrowWide size={14}/>:<ArrowDownWideNarrow size={14}/>}{view.dir==='asc'?'A→Z':'Z→A'}</button>}
  <label>Filter<select aria-label="Filter trait" value={view.filterKey} disabled={off} onChange={e=>set({filterKey:e.target.value})}><option value="">Any trait</option>{available.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
  <input type="search" aria-label="Filter text" placeholder="contains…" value={filter} disabled={off} onChange={e=>setFilter(e.target.value)}/>
  <label>Cover<select aria-label="Cover image trait" value={view.cover} disabled={off} onChange={e=>set({cover:e.target.value})}><option value="auto">Automatic</option><option value="none">No covers</option>{available.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
  <button type="button" aria-expanded={open} aria-pressed={open} onClick={()=>setOpen(!open)}><SlidersHorizontal size={14}/>Traits shown · {shown.length}</button>
  {open&&<div className="trait-fields" role="group" aria-label="Traits to show">{available.map(k=><button type="button" key={k} disabled={off} aria-pressed={shown.some(x=>x.toLocaleLowerCase()===k.toLocaleLowerCase())} onClick={()=>toggle(k)}>{k}</button>)}</div>}
  {error&&<span role="alert" className="trait-error">{error}</span>}
 </div>;
}
