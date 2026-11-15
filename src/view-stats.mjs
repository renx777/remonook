// Statistics for the view you are in (the ⓘ button in the top bar), in the spirit of Bear's
// statistics panel: words, characters, bullets and reading time for the notes on screen, and
// the matching figures for Bookmarks, Bookshelf and Calendar.
import {index,descendants} from './domain.mjs';

const plain=t=>String(t||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z#0-9]+;/gi,'x').replace(/\s+/g,' ').trim();
export const wordCount=t=>{const s=plain(t);return s?s.split(' ').length:0;};
/** Reading time at 230 words a minute, as people read it ("45 s", "3 min", "1 h 5 min"). */
export function readTime(words){
 const s=Math.round(words/230*60);
 if(s<60)return `${s} s`;const m=Math.round(s/60);
 return m<60?`${m} min`:`${Math.floor(m/60)} h${m%60?` ${m%60} min`:''}`;
}

/** Text statistics for a set of bullets. */
export function textStats(nodes){
 let words=0,characters=0,bullets=0,tasks=0,done=0;
 for(const n of nodes){
  if(n.blockStyle==='divider')continue;
  const text=plain(n.text);bullets++;characters+=text.length;words+=text?text.split(' ').length:0;
  if(n.taskState&&n.taskState!=='NONE'){tasks++;if(n.taskState==='DONE')done++;}
 }
 return {words,characters,bullets,tasks,done,readTime:readTime(words)};
}

/** The bullets a Notes view shows: everything, or the zoomed bullet and what is under it. */
export function notesInView(allNodes,scope){
 if(!scope)return allNodes;
 const keep=descendants(allNodes,scope);
 return allNodes.filter(n=>keep.has(n.id));
}

export function bookmarkStats(doc){
 const list=Object.values(doc.web.bookmarks||{}).filter(b=>b&&!b.deleted);
 const highlights=Object.values(doc.web.webHighlights||{}).filter(h=>h&&!h.deleted).length;
 return {saved:list.length,read:list.filter(b=>b.read).length,unread:list.filter(b=>!b.read).length,highlights};
}

export function bookStats(doc){
 const books=Object.values(doc.web.readingBooks||{}).filter(b=>b&&!b.deleted);
 const highlights=Object.values(doc.web.readingHighlights||{}).filter(h=>h&&!h.deleted).length;
 // Pages (PDF) or passages (EPUB) marked read, across all books.
 const read=books.reduce((sum,b)=>sum+Object.keys(doc.web.readingProgress?.[b.hash]?.units||{}).length,0);
 return {books:books.length,read,highlights};
}

/** Calendar entries (bullets with a date) in a month, and how many are done. */
export function calendarStats(nodes,date){
 const month=String(date||'').slice(0,7);
 const dated=nodes.filter(n=>(n.dueDate||n.journalDate||'').startsWith(month));
 return {entries:dated.length,done:dated.filter(n=>n.taskState==='DONE').length,month};
}

export {index};
