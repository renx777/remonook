// Disposable, bounded derived data. No notes, originals or shared state are written here.
export const SOURCE_TEXT_LIMIT=8*1024*1024, LIBRARY_TEXT_LIMIT=32*1024*1024;
export function librarySources(doc){
 const books=Object.values(doc.web.readingBooks||{}).filter(b=>!b.deleted).map(b=>({key:'book:'+b.id,id:b.id,hash:b.hash,title:b.title||'Untitled book',kind:b.format,path:undefined}));
 const articles=Object.values(doc.web.bookmarks||{}).filter(b=>!b.deleted&&b.snapshotHash).map(b=>({key:'article:'+b.id,id:b.id,hash:b.snapshotHash,title:b.title||b.url,kind:'article',path:b.snapshotPath}));
 return [...books,...articles];
}
export function checkedUnits(value){
 if(!Array.isArray(value)||value.length>10000)throw Error('Too many passages for local search.');let size=0;
 for(const u of value){if(!u||typeof u.text!=='string'||!Number.isInteger(u.unit)||u.unit<0||u.unit>=10000)throw Error('Invalid search passage.');size+=u.text.length;if(size>SOURCE_TEXT_LIMIT)throw Error('This source exceeds the local text search budget.');}
 return {units:value,size};
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function searchLibrary(entries,query,limit=40){
 const terms=(String(query).slice(0,500).trim().match(/"[^"]+"|\S+/g)||[]).slice(0,12).map(s=>s.replace(/^"|"$/g,'')).filter(Boolean);
 if(!terms.length)return [];const patterns=terms.map(t=>new RegExp(escape(t),'iu')),hits=[];
 for(const [key,entry] of entries){for(const u of entry.units){const matches=patterns.map(p=>p.exec(u.text));if(matches.some(m=>!m))continue;
 const start=Math.min(...matches.map(m=>m.index)),end=start+matches.find(m=>m.index===start)[0].length;
 let left=Math.max(0,start-65),right=Math.min(u.text.length,end+140);while(left>0&&left<start&&!/\s/u.test(u.text[left-1]))left++;while(right<u.text.length&&!/\s/u.test(u.text[right]))right++;
 hits.push({key,hash:entry.hash,unit:u.unit,chapter:u.chapter,start,end,quote:u.text.slice(Math.max(0,start-35),Math.min(u.text.length,end+60)).trim(),snippet:(left?'…':'')+u.text.slice(left,right)+(right<u.text.length?'…':'')});if(hits.length>=limit)return hits;
 }}return hits;
}

// TextContent and saved Readability text can differ in whitespace. Never guess an ambiguous hit.
export function locateLibraryQuote(text,quote){
 const parts=String(quote).trim().split(/\s+/u);if(!parts.length||!parts[0])return null;
 let result=null;for(const m of text.matchAll(new RegExp(parts.map(escape).join('\\s*'),'gu'))){if(result)return null;result={start:m.index,end:m.index+m[0].length};}return result;
}
