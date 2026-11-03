import {bullet} from './domain.mjs';
export function bookmarkUrl(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)throw Error('Enter a public http or https address.');url.hash='';return url.href;}
export const bookmarksIn=doc=>Object.values(doc.web.bookmarks||{}).filter(b=>!b.deleted);
export function addBookmark(doc,value){const url=bookmarkUrl(value),existing=bookmarksIn(doc).find(b=>b.url===url);if(existing)return{doc,bookmark:existing};const bookmark={id:crypto.randomUUID(),url,title:new URL(url).hostname,createdAt:Date.now(),tags:[],read:false,favourite:false,archived:false,deleted:false};return{doc:patchBookmark(doc,bookmark.id,bookmark),bookmark};}
export function patchBookmark(doc,id,patch){return{...doc,web:{...doc.web,bookmarks:{...doc.web.bookmarks,[id]:{...doc.web.bookmarks?.[id],...patch,id}}}};}
export function bookmarkNote(doc,bookmark,text,id=crypto.randomUUID(),source={}){
 const nodes=[...doc.tables.bullets],used=new Set(nodes.map(n=>n.id));for(const entry of doc.tables.trash||[]){let trashed=entry.nodes;try{if(!Array.isArray(trashed)&&typeof entry.payload==='string')trashed=JSON.parse(entry.payload).nodes;}catch{}if(Array.isArray(trashed))for(const node of trashed)used.add(node.id);}
 const available=base=>{let next=base,index=0;while(used.has(next))next=base+'-'+(++index);return next;};
 const prior=doc.web.bookmarkNoteRoots?.[bookmark.id];const rootId=prior&&nodes.some(n=>n.id===prior)?prior:available('web-'+bookmark.id);
 if(!nodes.some(n=>n.id===rootId))nodes.push(bullet(rootId,{text:bookmark.title,position:Math.max(-1,...nodes.filter(n=>!n.parentId).map(n=>n.position))+1}));
 if(!nodes.some(n=>n.id===id)&&used.has(id))id=available(id);
 if(!nodes.some(n=>n.id===id))nodes.push(bullet(id,{parentId:rootId,text,position:Math.max(-1,...nodes.filter(n=>n.parentId===rootId).map(n=>n.position))+1}));
 return{...doc,tables:{...doc.tables,bullets:nodes},web:{...doc.web,bookmarkNoteRoots:{...doc.web.bookmarkNoteRoots,[bookmark.id]:rootId},bookmarkSources:{...doc.web.bookmarkSources,[id]:{bookmarkId:bookmark.id,url:bookmark.url,title:bookmark.title,...(bookmark.snapshotHash?{snapshotHash:bookmark.snapshotHash}:{}),...source}}}};
}
export function webHighlight(doc,bookmark,anchor,color='yellow',comment='',kind='highlight'){
 if(!['highlight','text'].includes(kind))throw Error('Choose a valid passage style.');
 if(!anchor.exact?.trim()||anchor.exact.length>8000||!['yellow','green','blue','rose'].includes(color))throw Error('Select a shorter passage.');
 const existing=Object.values(doc.web.webHighlights||{}).find(h=>!h.deleted&&h.bookmarkId===bookmark.id&&h.hash===bookmark.snapshotHash&&h.start===anchor.start&&h.exact===anchor.exact);
 const id=existing?.id||crypto.randomUUID(),bulletId=existing&&doc.tables.bullets.some(n=>n.id===existing.bulletId)?existing.bulletId:'web-quote-'+crypto.randomUUID();
 let next=bookmarkNote(doc,bookmark,anchor.exact,bulletId,{highlightId:id});
 if(comment.trim())next={...next,tables:{...next.tables,bullets:[...next.tables.bullets,bullet(crypto.randomUUID(),{parentId:bulletId,text:comment.trim(),position:next.tables.bullets.filter(n=>n.parentId===bulletId).length})]}};
 return{...next,web:{...next.web,webHighlights:{...next.web.webHighlights,[id]:{id,bookmarkId:bookmark.id,hash:bookmark.snapshotHash,bulletId,...anchor,color,kind,deleted:false}}}};
}
export function validateBookmarks(web){
 for(const [id,b]of Object.entries(web.bookmarks||{})){if(b.id!==id||id.length>100||typeof b.title!=='string'||b.title.length>1000||!Array.isArray(b.tags)||b.tags.length>30||b.tags.some(t=>typeof t!=='string'||t.length>100))throw Error('Invalid bookmark.');bookmarkUrl(b.url);if(b.snapshotHash&&!/^[a-f0-9]{64}$/.test(b.snapshotHash))throw Error('Invalid article snapshot.');}
 for(const h of Object.values(web.webHighlights||{}))if(h.kind!==undefined&&!['highlight','text'].includes(h.kind)||typeof h.exact!=='string'||h.exact.length>8000||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<0||h.end<=h.start||!['yellow','green','blue','rose'].includes(h.color))throw Error('Invalid web highlight.');
}

export function refreshBookmark(doc,id,patch){const old=doc.web.bookmarks?.[id],sources={...doc.web.bookmarkSources};if(old?.snapshotHash)for(const [nodeId,source]of Object.entries(sources))if(source.bookmarkId===id&&!source.snapshotHash){const h=source.highlightId&&doc.web.webHighlights?.[source.highlightId];sources[nodeId]={...source,snapshotHash:h?.hash||old.snapshotHash};}const next=patchBookmark(doc,id,patch);return{...next,web:{...next.web,bookmarkSources:sources}};}
export function articleSnapshotHashes(doc){return new Set([...Object.values(doc.web.bookmarks||{}).map(b=>b.snapshotHash),...Object.values(doc.web.bookmarkSources||{}).map(s=>s.snapshotHash),...Object.values(doc.web.webHighlights||{}).map(h=>h.hash)].filter(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)));}
