import {CardDetailsButton} from './CardDetailsDialog';
import {cardDetails} from './card-details.mjs';
import {useEffect,useMemo,useState} from 'react';
import {LayoutGrid,List,ListTree,Table2,ExternalLink,ArrowUpRight,Plus} from 'lucide-react';
import {mediaLinks} from './media.mjs';
import {snapshotIndex} from './outline-snapshot.mjs';
import {useImageUrl} from './ImageTools';
import {PreviewImage,useLinkPreview} from './LinkPreview';
import {previewPrice} from './link-preview-client';
import type {Node,Workspace} from './data';
import './bullet-collection.css';
const VIEWS=[['outline','Outline',ListTree],['grid','Grid',LayoutGrid],['list','Compact list',List],['table','Table',Table2]] as const;
export function BulletViewSwitch({value,onChange,disabled=false}:{value:string;onChange:(view:string)=>void;disabled?:boolean}){
 return <div className="bullet-view-switch" role="group" aria-label="Child bullet view">{VIEWS.map(([key,label,Icon])=><button type="button" key={key} aria-pressed={value===key} aria-label={label+' view'} title={label} disabled={disabled} onClick={()=>onChange(key)}><Icon size={14}/><span>{label}</span></button>)}</div>;
}
function useItem(doc:Workspace,node:Node,assets:Map<string,Blob>){
 const link=useMemo(()=>mediaLinks(node.text)[0]||null,[node.text]),url=link?.href||null;
 const preview=useLinkPreview(link&&link.kind!=='image'?url:null),media=doc.tables.media.find(m=>m.bulletId===(node.mirrorSourceId||node.id)&&String(m.mimeType||'').startsWith('image/'));
 const local=useImageUrl(media||{},media?assets.get('media/'+media.fileName):undefined);
 const label=node.text.replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/https?:\/\/[^\s<>"']+/g,'').trim();
 const details=url?cardDetails(doc,node.id,url):null;
 const title=details?.title||(label?label.split('\n')[0]:'')||preview.data?.title||(url?new URL(url).hostname.replace(/^www\./,''):'Untitled');
 const image=details?.image||local||(link?.kind==='image'?url:preview.data?.image)||null;
 return {...preview,url,title,image,site:preview.data?.site||(url?new URL(url).hostname.replace(/^www\./,''):''),details,price:previewPrice(details?.amount?{amount:details.amount,currency:details.currency,from:false}:preview.data?.price||null),description:details?.description||preview.data?.description||(!url?node.text.split('\n').slice(1).join('\n'):'')};
}
type ItemProps={doc:Workspace;node:Node;assets:Map<string,Blob>;onOpen:(id:string)=>void;childCount:number};
function CollectionCard({doc,node,assets,onOpen,childCount}:ItemProps){
 const item=useItem(doc,node,assets),[imageFailed,setImageFailed]=useState(false);useEffect(()=>setImageFailed(false),[item.image]);
 return <article ref={item.root} className={'collection-card'+(item.url||item.image?' has-cover':'')}>
  {((item.image&&!imageFailed)||item.loading)&&<button className="collection-cover" type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><PreviewImage src={item.image} title={item.title} onUnavailable={()=>setImageFailed(true)}/></button>}
  <div className="collection-card-copy"><span className="collection-site">{item.site||'Note'}</span><button type="button" className="collection-title" onClick={()=>onOpen(node.id)}>{item.title}</button>{item.description&&<p>{item.description}</p>}
   {item.price&&<><strong className="collection-price" title={item.details?.amount?'Your entered price':'Page preview · prices may change'}>{item.price}</strong><small className="collection-price-source">{item.details?.amount?'Your price':'Website preview'}</small></>}
   <footer>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">Open website <ExternalLink size={12}/></a>:<span>{childCount?childCount+' nested '+(childCount===1?'note':'notes'):'Text note'}</span>}<span className="collection-card-actions">{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={14}/></button></span></footer>
   {item.details&&<small className="collection-status">Your details{item.details.amount?' · entered price':''}</small>}{item.error&&!item.details&&<small className="collection-status">Preview unavailable · link kept</small>}{item.loading&&item.url&&<small className="collection-status" role="status">Loading preview…</small>}
  </div>
 </article>;
}
function CollectionTableRow({doc,node,assets,onOpen}:ItemProps){
 const item=useItem(doc,node,assets);
 return <tr><td><div ref={item.root} className="collection-table-item"><div className="collection-table-thumbnail"><PreviewImage src={item.image} title={item.title}/></div><div><button className="collection-title" type="button" onClick={()=>onOpen(node.id)}>{item.title}</button>{item.error&&<small>Preview unavailable · link kept</small>}{item.loading&&item.url&&<small role="status">Loading…</small>}</div></div></td><td>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.site}<ExternalLink size={11}/></a>:'Note'}</td><td>{item.price||'—'}{item.details?.amount&&<small className="collection-status">Your price</small>}</td><td>{item.data?.availability||'—'}</td><td>{item.url&&<CardDetailsButton nodeId={node.id} url={item.url} label={item.title}/>}<button type="button" className="collection-open" aria-label={'Open note: '+item.title} onClick={()=>onOpen(node.id)}><ArrowUpRight size={15}/></button></td></tr>;
}
export function BulletCollection({doc,nodes,mode,assets,onOpen,onAdd}:{doc:Workspace;nodes:Node[];mode:string;assets:Map<string,Blob>;onOpen:(id:string)=>void;onAdd?:()=>void}){
 const [limit,setLimit]=useState(24),idx=useMemo(()=>snapshotIndex(doc.tables.bullets),[doc.tables.bullets]);
 useEffect(()=>setLimit(24),[nodes[0]?.parentId,mode]);
 const items=nodes.slice(0,limit),props=(node:Node)=>({doc,node,assets,onOpen,childCount:(idx.children.get(node.id)||[]).length});
 return <div className={'bullet-collection collection-'+mode}>
  <div className="collection-toolbar"><span>{nodes.length} {nodes.length===1?'item':'items'}</span>{onAdd&&<button type="button" onClick={onAdd}><Plus size={14}/>Add note or link</button>}</div>
  {!nodes.length&&<div className="collection-empty"><LayoutGrid size={25}/><p>A little room for a collection.</p><small>Add child notes or paste website links, then choose how to see them.</small>{onAdd&&<button type="button" onClick={onAdd}>Add your first item</button>}</div>}
  {mode==='table'&&nodes.length>0?<div className="collection-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}><table><caption>Child notes and page previews. Prices are captured page data and may change.</caption><thead><tr><th scope="col">Item</th><th scope="col">Website</th><th scope="col">Price</th><th scope="col">Availability</th><th scope="col"><span className="sr-only">Open note</span></th></tr></thead><tbody>{items.map(node=><CollectionTableRow key={node.id} {...props(node)}/>)}</tbody></table></div>:<div className="collection-items">{items.map(node=><CollectionCard key={node.id} {...props(node)}/>)}</div>}
  {nodes.length>limit&&<button className="collection-more" type="button" onClick={()=>setLimit(value=>value+24)}>Show {Math.min(24,nodes.length-limit)} more · {nodes.length-limit} remaining</button>}
  {nodes.length>0&&<p className="collection-footnote">Your original notes, in a different view. Website details may be unavailable or change.</p>}
 </div>;
}
