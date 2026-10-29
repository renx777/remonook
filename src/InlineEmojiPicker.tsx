import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type MutableRefObject} from 'react';
import {createPortal} from 'react-dom';
import type {Editor} from '@tiptap/core';
import type {RecordData} from './data';
import {Icon} from './icons';
import {useEmojiLibrary} from './AnimatedEmoji';
import {catalogEmojis,emojiCollection,emojiCollectionLabel} from './emoji-catalog.mjs';
import {useEmojiCollection} from './useEmojiCollection';
import {builtinEmojis} from './emoji-builtins.mjs';
import {emojiQuery,createEmojiSearchIndex,searchEmojiIndex} from './emoji-suggestions.mjs';
import {EmojiThumbnail,InlineEmojiPreview} from './InlineEmojiArtwork';
import {LayoutGrid,Clock3,Smile,UserRound,Leaf,Coffee,Car,Volleyball,Lightbulb,Heart,Flag} from 'lucide-react';

const catalog=new Map(catalogEmojis.map(item=>[item.token,item]));
const tabs=[['noto','Google Noto'],['fluent','Microsoft Fluent'],['library','My library']] as const;
const recentKey='remo-inline-emoji-recents';
const categories=[['all','All emojis',LayoutGrid],['recent','Recently used',Clock3],['Smileys and emotions','Smileys & emotion',Smile],['People','People',UserRound],['Animals and nature','Animals & nature',Leaf],['Food and drink','Food & drink',Coffee],['Travel and places','Travel & places',Car],['Activities and events','Activities',Volleyball],['Objects','Objects',Lightbulb],['Symbols','Symbols',Heart],['Flags','Flags',Flag]] as const;
const searchLibraries=new WeakMap<Map<string,RecordData>,{items:RecordData[];index:ReturnType<typeof createEmojiSearchIndex>}>();
const emptyItems:RecordData[]=[],emptyIndex=createEmojiSearchIndex([]);
function searchLibrary(emojis:Map<string,RecordData>){
 let value=searchLibraries.get(emojis);if(!value){const items=[...new Map([...catalogEmojis,...builtinEmojis,...emojis.values()].map(item=>[item.token,{...item,...catalog.get(item.token)}])).values()];value={items,index:createEmojiSearchIndex(items)};searchLibraries.set(emojis,value);}return value;
}
const rowHeight=40;
function readRecent():string[]{try{const value=JSON.parse(window.localStorage.getItem(recentKey)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string').slice(0,20):[];}catch{return [];}}
function readLibraryTab(){try{return window.localStorage.getItem('remo-inline-emoji-library')==='true';}catch{return false;}}

export function InlineEmojiPicker({editor,nodeId,enabled,keyHandler}:{editor:Editor;nodeId:string;enabled:boolean;keyHandler:MutableRefObject<((event:KeyboardEvent)=>boolean)|null>}){
 const {emojis,assets,onInsert}=useEmojiLibrary(),listId=useId();
 const [collection,setCollection]=useEmojiCollection(),[libraryTab,setLibraryTab]=useState(readLibraryTab),[recent,setRecent]=useState(readRecent);
 const previousCollection=useRef(collection);
 const selectedTab=libraryTab?'library':collection==='fluent'?'fluent':'noto';
 const [query,setQuery]=useState<ReturnType<typeof emojiQuery>>(null),[active,setActive]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [category,setCategory]=useState('all'),[searchOverride,setSearchOverride]=useState<string|null>(null),[scrollTop,setScrollTop]=useState(0),[gridHeight,setGridHeight]=useState(240),[columns,setColumns]=useState(8);
 const grid=useRef<HTMLDivElement>(null),editorQuery=useRef('');
 const searchText=searchOverride??query?.query??'';
 const [position,setPosition]=useState({left:8,top:8,height:390});
 const dismissed=useRef(''),lastQuery=useRef(''),pending=useRef(false),mounted=useRef(true),popup=useRef<HTMLDivElement>(null),touch=useRef(false);
 // Ordinary editing never builds a catalogue that is not being displayed.
 const library=useMemo(()=>query?searchLibrary(emojis):null,[emojis,!!query]);
 const items=library?.items||emptyItems,index=library?.index||emptyIndex;
 const matches:RecordData[]=useMemo(()=>{
  if(!query)return [];
  const provider=(item:RecordData)=>selectedTab==='library'?(emojis.has(item.token)||emojiCollection(item)==='custom'):emojiCollection(item)===selectedTab;
  const accept=(item:RecordData)=>provider(item)&&(!!searchText||category==='all'||category==='recent'&&recent.includes(item.token)||item.category===category);
  const found:RecordData[]=searchEmojiIndex(index,searchText,items.length,accept);
  if(searchText||category!=='all'&&category!=='recent')return found;
  const previous=recent.map(token=>items.find(item=>item.token===token)).filter((item):item is RecordData=>!!item&&accept(item));
  return [...new Map([...previous,...found].map(item=>[item.token,item])).values()];
 },[index,searchText,!!query,selectedTab,recent,items,emojis,category]);
 const alternatives=useMemo(()=>{
  if(!searchText||matches.length)return [];
  return tabs.filter(([value])=>value!==selectedTab&&searchEmojiIndex(index,searchText,1,(item:RecordData)=>value==='library'?emojis.has(item.token):emojiCollection(item)===value).length);
 },[index,searchText,matches.length,selectedTab,emojis]);
 const selected=matches[Math.min(active,Math.max(0,matches.length-1))];
 const selectTab=(value:string)=>{setLibraryTab(value==='library');try{window.localStorage.setItem('remo-inline-emoji-library',String(value==='library'));}catch{}if(value!=='library')setCollection(value);setActive(0);setError('');};
 useEffect(()=>{if(previousCollection.current!==collection){previousCollection.current=collection;setLibraryTab(false);try{window.localStorage.setItem('remo-inline-emoji-library','false');}catch{}}},[collection]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const update=(event?:{transaction?:{getMeta:(key:string)=>any}})=>{
   if(pending.current||editor.isDestroyed)return;
   // ProseMirror dispatches its blur transaction before focus reaches the input.
   // Its relatedTarget is the reliable destination during that transition.
   const destination=event?.transaction?.getMeta('blur')?.event?.relatedTarget;
   if(destination&&popup.current?.contains(destination))return;
   const {from,to,$from}=editor.state.selection;
   const focused=editor.isFocused||popup.current?.contains(document.activeElement);
   const next=enabled&&onInsert&&focused&&from===to&&!editor.isActive('code')?emojiQuery($from.parent.textBetween(0,$from.parentOffset,'\n'),$from.parentOffset):null;
   const identity=next?`${next.start}:${next.end}:${next.query}`:'';
   if(!next||dismissed.current===identity){setQuery(null);return;}
   setQuery(previous=>previous?.start===next.start&&previous?.end===next.end&&previous?.query===next.query?previous:next);
  };
  const blur=({event}:{event:FocusEvent})=>{if(!pending.current&&!popup.current?.contains(event.relatedTarget as Node))setQuery(null);};
  editor.on('transaction',update);editor.on('focus',update);editor.on('blur',blur);update();
  return()=>{editor.off('transaction',update);editor.off('focus',update);editor.off('blur',blur);};
 },[editor,enabled,onInsert]);
 useEffect(()=>{
  if(!query)return;
  const identity=`${selectedTab}:${query.start}:${query.query}`;
  if(lastQuery.current!==identity){lastQuery.current=identity;setActive(0);setError('');}
 },[query?.start,query?.query,selectedTab]);
 useEffect(()=>{if(!query){setSearchOverride(null);return;}const identity=`${query.start}:${query.query}`;if(editorQuery.current!==identity){editorQuery.current=identity;setSearchOverride(null);}},[query?.start,query?.query]);
 useLayoutEffect(()=>{setActive(0);setScrollTop(0);if(grid.current)grid.current.scrollTop=0;},[searchText,selectedTab,category]);
 useLayoutEffect(()=>{
  if(!query||!grid.current)return;
  const measure=()=>{const element=grid.current;if(!element)return;setGridHeight(element.clientHeight||240);setColumns(Math.max(5,Math.min(8,Math.floor((element.clientWidth||320)/(window.matchMedia('(pointer: coarse)').matches?38:36)))));};
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(grid.current);window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
 },[!!query,position.height,matches.length]);
 useLayoutEffect(()=>{
  if(!query)return;
  const place=()=>{
   if(editor.isDestroyed)return;
   try{
    const caret=editor.view.coordsAtPos(editor.state.selection.from),viewport=window.visualViewport;
    const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
    const touchLayout=window.matchMedia('(pointer: coarse)').matches;
    const popupWidth=Math.min(touchLayout?360:320,width-16),desired=(touchLayout?480:400)+(error?36:0);
    const below=top+height-caret.bottom-12,above=caret.top-top-12,down=below>=desired||below>=above;
    const available=Math.max(0,down?below:above),dock=width<=760&&available<260;
    const panelHeight=Math.max(0,Math.min(desired,dock?height-16:available));
    const next={left:Math.max(left+8,Math.min(caret.left,left+width-popupWidth-8)),top:dock?top+8:down?caret.bottom+6:Math.max(top+8,caret.top-panelHeight-6),height:panelHeight};
    setPosition(previous=>previous.left===next.left&&previous.top===next.top&&previous.height===next.height?previous:next);
   }catch{/* The editor may have detached while navigation closes the picker. */}
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
 },[editor,query,matches.length,error]);
 useLayoutEffect(()=>{const element=grid.current;if(!element)return;const top=Math.floor(active/columns)*rowHeight,bottom=top+rowHeight,visible=element.clientHeight||gridHeight;let next=element.scrollTop;if(top<next)next=top;else if(bottom>next+visible)next=bottom-visible;if(next!==element.scrollTop){element.scrollTop=next;setScrollTop(next);}},[active,columns]);
 const dismiss=()=>{if(query)dismissed.current=`${query.start}:${query.end}:${query.query}`;setQuery(null);};
 const choose=async(item:RecordData)=>{
  if(!query||pending.current||!onInsert)return;
  const selection=query;pending.current=true;setBusy(true);setError('');
  try{
   await onInsert(item,nodeId,selection.start,selection.end);
   if(mounted.current){const next=[item.token,...recent.filter(token=>token!==item.token)].slice(0,20);setRecent(next);try{window.localStorage.setItem(recentKey,JSON.stringify(next));}catch{}dismiss();}
  }catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'Could not insert emoji. Try again.');}
  finally{pending.current=false;if(mounted.current&&!editor.isDestroyed){setBusy(false);editor.commands.focus();}}
 };
 keyHandler.current=event=>{
  if(!query||event.isComposing||event.ctrlKey||event.metaKey)return false;
  if(busy&&['Enter','Tab','Escape','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))return true;
  if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){const at=tabs.findIndex(([value])=>value===selectedTab);selectTab(tabs[(at+(event.key==='ArrowRight'?1:2))%3][0]);return true;}
  if(event.altKey)return false;
  if(event.key==='Escape'){dismiss();return true;}
  if(matches.length&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)){setActive(value=>(value+(event.key==='ArrowDown'?columns:event.key==='ArrowUp'?-columns:event.key==='ArrowRight'?1:-1)+matches.length)%matches.length);return true;}
  if(selected&&!event.shiftKey&&['Enter','Tab'].includes(event.key)){void choose(selected);return true;}
  return false;
 };
 useEffect(()=>()=>{keyHandler.current=null;},[keyHandler]);
 useEffect(()=>{
  const dom=editor.view.dom;
  if(query){dom.setAttribute('aria-controls',listId);dom.setAttribute('aria-expanded','true');dom.setAttribute('aria-autocomplete','list');if(selected)dom.setAttribute('aria-activedescendant',`${listId}-${Math.min(active,matches.length-1)}`);else dom.removeAttribute('aria-activedescendant');}
  else{dom.removeAttribute('aria-controls');dom.removeAttribute('aria-expanded');dom.removeAttribute('aria-autocomplete');dom.removeAttribute('aria-activedescendant');}
 },[editor,query,active,matches,listId,selected]);
 if(!query)return null;
 const first=Math.max(0,Math.floor(scrollTop/rowHeight)-2)*columns,last=Math.min(matches.length,(Math.ceil((scrollTop+gridHeight)/rowHeight)+2)*columns);
 const visible=matches.slice(first,last).map((item,offset)=>({item,index:first+offset}));
 if(selected&&(active<first||active>=last))visible.push({item:selected,index:active});
 return createPortal(<div ref={popup} className="inline-emoji-picker" data-compact={position.height<300} style={{left:position.left,top:position.top,maxHeight:position.height}} onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>{event.stopPropagation();if(!(event.target as HTMLElement).closest('input'))event.preventDefault();}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();editor.commands.focus();}else if(event.target instanceof HTMLInputElement&&(['ArrowDown','ArrowUp','Enter'].includes(event.key)||event.altKey)&&keyHandler.current?.(event.nativeEvent)){event.preventDefault();event.stopPropagation();}}}>
  <label className="inline-emoji-search"><Icon name="search" size={17}/><input role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={selected?`${listId}-${Math.min(active,matches.length-1)}`:undefined} aria-label="Search emoji" placeholder="Search emoji" value={searchText} maxLength={128} disabled={busy} onChange={event=>{setSearchOverride(event.target.value);setError('');}}/><button type="button" className="inline-emoji-close" aria-label="Close emoji suggestions" disabled={busy} onClick={dismiss}><Icon name="close" size={14}/></button></label>
  <div className="inline-emoji-tabs" role="tablist" aria-label="Emoji artwork collection" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy)return;event.preventDefault();event.stopPropagation();const at=tabs.findIndex(([value])=>value===selectedTab),next=event.key==='Home'?0:event.key==='End'?2:(at+(event.key==='ArrowRight'?1:2))%3;selectTab(tabs[next][0]);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>{tabs.map(([value,label])=><button type="button" role="tab" key={value} aria-selected={selectedTab===value} aria-controls={listId} tabIndex={selectedTab===value?0:-1} disabled={busy} onClick={()=>selectTab(value)}>{label}</button>)}</div>
  <div className="inline-emoji-categories" role="toolbar" aria-label="Emoji categories">{categories.map(([value,label,Glyph])=><button type="button" key={value} title={label} aria-label={label} aria-pressed={!searchText&&category===value} disabled={busy} onClick={()=>{setCategory(value);setSearchOverride('');setError('');}}><Glyph size={18} strokeWidth={1.6}/></button>)}</div>
  <div className="inline-emoji-query"><span>{searchText?'Search results':categories.find(([value])=>value===category)?.[1]}</span><small>{matches.length} emojis</small></div>
  <div ref={grid} className="inline-emoji-results" role="listbox" id={listId} aria-label="Emoji suggestions" aria-busy={busy} onScroll={event=>setScrollTop(event.currentTarget.scrollTop)}><div className="inline-emoji-virtual-content" style={{height:Math.ceil(matches.length/columns)*rowHeight}}>{visible.map(({item,index:i})=><button type="button" role="option" style={{position:"absolute",top:Math.floor(i/columns)*rowHeight,left:`${i%columns*100/columns}%`,width:`${100/columns}%`}} aria-posinset={i+1} aria-setsize={matches.length} id={`${listId}-${i}`} key={item.token} aria-selected={active===i} aria-label={`${item.label} · ${emojiCollectionLabel(item)}`} title={item.label} disabled={busy} tabIndex={-1} onPointerDown={event=>{touch.current=event.pointerType==='touch'||event.pointerType==='pen';}} onMouseEnter={()=>{if(!window.matchMedia('(pointer: coarse)').matches)setActive(i);}} onClick={()=>{const previewOnly=touch.current||window.matchMedia('(pointer: coarse)').matches;touch.current=false;if(previewOnly)setActive(i);else void choose(item);}}><EmojiThumbnail item={item}/><span className="inline-emoji-label">{item.label}</span>{assets.has('emoji/'+item.fileName)&&<small className="inline-emoji-offline" title="Saved offline"><Icon name="check" size={10}/></small>}</button>)}</div></div>
  {!matches.length&&<div className="inline-emoji-empty"><p>No matches in {tabs.find(([value])=>value===selectedTab)?.[1]}.</p>{alternatives.map(([value,label])=><button type="button" key={value} onClick={()=>selectTab(value)}>Search {label}</button>)}</div>}
  {error&&<p role="alert" className="emoji-import-error">{error}</p>}
  {selected&&<div className="inline-emoji-selection"><InlineEmojiPreview key={selected.token} item={selected}/><div className="inline-emoji-caption"><strong>{selected.label}</strong><small>{busy?'Saving for offline use…':emojiCollectionLabel(selected)}</small></div><button type="button" className="inline-emoji-insert" title="Enter to insert · Escape to close" disabled={busy} onClick={()=>void choose(selected)}>{busy?'Saving…':'Insert'}</button></div>}

 </div>,editor.view.dom.closest('.app')||document.body);
}
