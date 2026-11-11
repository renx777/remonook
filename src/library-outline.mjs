// Bookmarks and books organized with the outline. Every saved article and every book has one
// bullet in Notes (its "note root": web.bookmarkNoteRoots / web.readingNoteRoots, where its
// highlights and notes already go). New ones start under a "Library" bullet at the top of Notes;
// moving that bullet anywhere organizes the item. The bullets above it become the folders shown
// in the Bookmarks and Bookshelf navigators.
//
// - Ids are deterministic ('web-<bookmark id>', 'book-<hash>', 'library'), so two devices doing
//   this at the same time create the same bullets, which sync merges.
// - Deleting an item's bullet in Notes hides the item (it is in Trash with the bullet); restoring
//   the bullet brings it back. Only the first run (libraryVersion 1) recreates missing bullets,
//   for notes removed before this existed.
import {bullet,index,move,descendants} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';

export const LIBRARY_ID='library';
const usedIds=doc=>{
 const ids=new Set(doc.tables.bullets.map(n=>n.id));
 for(const entry of doc.tables.trash||[]){let nodes=entry.nodes;try{if(!Array.isArray(nodes)&&typeof entry.payload==='string')nodes=JSON.parse(entry.payload).nodes;}catch{/* ignore */}if(Array.isArray(nodes))for(const n of nodes)if(typeof n?.id==='string')ids.add(n.id);}
 return ids;
};
const available=(base,used)=>{let id=base,i=0;while(used.has(id))id=base+'-'+(++i);return id;};

/** Every bookmark and book that is not deleted, with its bullet. */
export function libraryItems(doc){
 const out=[];
 for(const b of Object.values(doc.web.bookmarks||{}))if(b&&!b.deleted)out.push({kind:'bookmark',key:b.id,title:b.title||b.url,rootId:doc.web.bookmarkNoteRoots?.[b.id]||null});
 for(const b of Object.values(doc.web.readingBooks||{}))if(b&&!b.deleted)out.push({kind:'book',key:b.hash,title:b.title||b.name||'Book',rootId:doc.web.readingNoteRoots?.[b.hash]||null});
 return out;
}

/** Gives every item a bullet (new items under Library). Returns the same document when nothing changes. */
export function ensureLibrary(doc){
 const first=doc.web.libraryVersion!==1,ids=new Set(doc.tables.bullets.map(n=>n.id));
 const missing=libraryItems(doc).filter(i=>!i.rootId||(first&&!ids.has(i.rootId)));
 if(!missing.length)return first?{...doc,web:{...doc.web,libraryVersion:1}}:doc;
 let nodes=[...doc.tables.bullets];const used=usedIds(doc);
 if(!ids.has(LIBRARY_ID)){
  // The Library bullet goes first at the top level.
  nodes=nodes.map(n=>n.parentId===null?{...n,position:n.position+1}:n);
  nodes.push(bullet(LIBRARY_ID,{text:'Library',position:0}));used.add(LIBRARY_ID);
 }
 let position=Math.max(-1,...nodes.filter(n=>n.parentId===LIBRARY_ID).map(n=>n.position))+1;
 const bookmarkRoots={...doc.web.bookmarkNoteRoots},bookRoots={...doc.web.readingNoteRoots};
 for(const item of missing){
  const id=available(item.kind==='bookmark'?'web-'+item.key:'book-'+item.key,used);used.add(id);
  nodes.push(bullet(id,{parentId:LIBRARY_ID,position:position++,text:item.title,collapsed:true}));
  if(item.kind==='bookmark')bookmarkRoots[item.key]=id;else bookRoots[item.key]=id;
 }
 const next=withNodes(doc,nodes);
 return {...next,web:{...next.web,bookmarkNoteRoots:bookmarkRoots,readingNoteRoots:bookRoots,libraryVersion:1}};
}

/**
 * The navigator for one kind ('bookmark' or 'book'): the folders (bullets above items' bullets,
 * Library excluded) as a tree with counts, each item's folder chain, and items not placed yet.
 */
export function libraryTree(doc,kind){
 const idx=index(doc.tables.bullets),items=libraryItems(doc).filter(i=>i.kind===kind);
 const folders=new Map(),itemFolders=new Map(),visible=[],unsorted=[];
 for(const item of items){
  // No bullet yet (just saved): not organized. A bullet that was deleted: the item is in Trash with it.
  if(!item.rootId){visible.push(item);itemFolders.set(item.key,[]);unsorted.push(item.key);continue;}
  const root=idx.byId.get(item.rootId);
  if(!root)continue;
  visible.push(item);
  const chain=[];let p=root.parentId;
  while(p&&p!==LIBRARY_ID){const n=idx.byId.get(p);if(!n)break;chain.unshift(n.id);p=n.parentId;}
  itemFolders.set(item.key,chain);
  if(!chain.length){unsorted.push(item.key);continue;}
  chain.forEach((id,depth)=>{const n=idx.byId.get(id),f=folders.get(id)||{id,title:(n.text||'Untitled').replace(/<[^>]*>/g,'').slice(0,80),parentId:depth?chain[depth-1]:null,count:0,position:n.position};f.count++;folders.set(id,f);});
 }
 const children=new Map();
 for(const f of folders.values()){const list=children.get(f.parentId)||[];list.push(f);children.set(f.parentId,list);}
 for(const list of children.values())list.sort((a,b)=>a.position-b.position||a.title.localeCompare(b.title));
 return {folders,children,itemFolders,visible,unsorted};
}

/** Whether an item is inside a folder (or, for null, anywhere). */
export const inFolder=(tree,key,folder)=>folder===null||(folder==='unsorted'?tree.unsorted.includes(key):(tree.itemFolders.get(key)||[]).includes(folder));

/** Moves an item's bullet (with its notes) under another bullet, at the end. */
export function moveLibraryItem(doc,rootId,parentId){
 const nodes=doc.tables.bullets;
 if(!nodes.some(n=>n.id===rootId))throw Error('This item has no bullet in Notes.');
 if(parentId&&!nodes.some(n=>n.id===parentId))throw Error('That bullet no longer exists.');
 if(parentId&&descendants(nodes,rootId).has(parentId))throw Error('An item cannot move inside its own notes.');
 const target=parentId||LIBRARY_ID,count=nodes.filter(n=>n.parentId===target&&n.id!==rootId).length;
 return withNodes(doc,move(nodes,rootId,target,count));
}

/** Where a new item goes: the folder being viewed, or Library. */
export function placeNewItem(doc,kind,key,folder){
 const roots=kind==='bookmark'?doc.web.bookmarkNoteRoots:doc.web.readingNoteRoots,rootId=roots?.[key];
 if(!rootId||!folder||folder==='unsorted')return doc;
 return doc.tables.bullets.some(n=>n.id===folder)?moveLibraryItem(doc,rootId,folder):doc;
}
