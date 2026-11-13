// Bookmarks and books organized with the outline. A saved article or book can have one bullet in
// Notes (its "note root": web.bookmarkNoteRoots / web.readingNoteRoots, where its highlights and
// notes already go). Moving that bullet anywhere organizes the item; the bullets above it become
// the folders shown in the Bookmarks and Bookshelf navigators.
//
// - Nothing is added to Notes on its own: an item gets its bullet only when the user files it
//   (Move to…, or saving while a folder is open). Items without one are "Not organized yet".
// - Ids are deterministic ('web-<bookmark id>', 'book-<hash>', 'library'), so two devices doing
//   this at the same time create the same bullets, which sync merges.
// - Deleting an item's bullet in Notes hides the item while the bullet is in Trash; restoring the
//   bullet brings it back. A bullet that is gone for good leaves the item not organized.
import {bullet,index,move,descendants} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';

export const LIBRARY_ID='library';
const trashedIds=doc=>{
 const ids=new Set();
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

/** Adds the Library bullet (last at the top level, so nothing else moves). */
function withLibrary(doc){
 if(doc.tables.bullets.some(n=>n.id===LIBRARY_ID))return doc;
 const position=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===null).map(n=>n.position))+1;
 return withNodes(doc,[...doc.tables.bullets,bullet(LIBRARY_ID,{text:'Library',position})]);
}

/** Gives one item a bullet, at the end of `parentId` (Library by default), when it has none.
 Returns the same document otherwise. */
export function ensureItem(doc,kind,key,parentId=LIBRARY_ID){
 const item=libraryItems(doc).find(i=>i.kind===kind&&i.key===key);
 if(!item)throw Error(kind==='bookmark'?'This bookmark no longer exists.':'This book no longer exists.');
 if(item.rootId&&doc.tables.bullets.some(n=>n.id===item.rootId))return doc;
 const base=parentId===LIBRARY_ID?withLibrary(doc):doc;
 if(!base.tables.bullets.some(n=>n.id===parentId))throw Error('That bullet no longer exists.');
 const used=new Set([...base.tables.bullets.map(n=>n.id),...trashedIds(doc)]);
 const id=available(kind==='bookmark'?'web-'+key:'book-'+key,used);
 const position=base.tables.bullets.filter(n=>n.parentId===parentId).length;
 const next=withNodes(base,[...base.tables.bullets,bullet(id,{parentId,position,text:item.title,collapsed:true})]);
 return kind==='bookmark'?{...next,web:{...next.web,bookmarkNoteRoots:{...next.web.bookmarkNoteRoots,[key]:id}}}:{...next,web:{...next.web,readingNoteRoots:{...next.web.readingNoteRoots,[key]:id}}};
}

/**
 * The navigator for one kind ('bookmark' or 'book'): the folders (bullets above items' bullets,
 * Library excluded) as a tree with counts, each item's folder chain, and items not placed yet.
 */
export function libraryTree(doc,kind){
 const idx=index(doc.tables.bullets),trashed=trashedIds(doc),items=libraryItems(doc).filter(i=>i.kind===kind);
 const folders=new Map(),itemFolders=new Map(),visible=[],unsorted=[];
 for(const item of items){
  // No bullet: not organized. A bullet in Trash: the item is hidden until it is restored.
  const root=item.rootId?idx.byId.get(item.rootId):null;
  if(!root){if(item.rootId&&trashed.has(item.rootId))continue;visible.push(item);itemFolders.set(item.key,[]);unsorted.push(item.key);continue;}
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

/** Moves an item's bullet (with its notes) to the end of another bullet (Library when none is
 given), creating the item's bullet there if it has none. */
export function moveLibraryItem(doc,kind,key,parentId){
 const target=parentId||LIBRARY_ID,before=ensureItem(doc,kind,key,target);
 if(before!==doc)return before;
 const nodes=doc.tables.bullets,rootId=(kind==='bookmark'?doc.web.bookmarkNoteRoots:doc.web.readingNoteRoots)[key];
 const base=target===LIBRARY_ID?withLibrary(doc):doc;
 if(!base.tables.bullets.some(n=>n.id===target))throw Error('That bullet no longer exists.');
 if(descendants(nodes,rootId).has(target))throw Error('An item cannot move inside its own notes.');
 const count=base.tables.bullets.filter(n=>n.parentId===target&&n.id!==rootId).length;
 return withNodes(base,move(base.tables.bullets,rootId,target,count));
}

/** Where a new item goes: into the folder being viewed; otherwise it stays not organized. */
export function placeNewItem(doc,kind,key,folder){
 if(!folder||folder==='unsorted'||!doc.tables.bullets.some(n=>n.id===folder))return doc;
 return moveLibraryItem(doc,kind,key,folder);
}
