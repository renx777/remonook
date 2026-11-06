import {localDate,validEventDate} from './calendar-events.mjs';
import {noteLinks} from './relations.mjs';
const DAY=86400000,stamp=d=>Date.parse(d+'T00:00:00Z'),iso=d=>new Date(d).toISOString().slice(0,10);
export function dateRange(value,today=localDate()){
 const text=value.toLowerCase().trim(),t=stamp(today),d=new Date(t),y=d.getUTCFullYear(),m=d.getUTCMonth();
 if(validEventDate(text))return [text,text];
 const range=text.split('..');if(range.length===2&&range.every(validEventDate)&&range[0]<=range[1])return range;
 if(['today','tomorrow','yesterday'].includes(text)){const at=iso(t+({'today':0,'tomorrow':1,'yesterday':-1}[text])*DAY);return [at,at];}
 if(/^(this|next|last) week$/.test(text)){const offset=text.startsWith('next')?7:text.startsWith('last')?-7:0,start=t-((d.getUTCDay()+6)%7)*DAY+offset*DAY;return [iso(start),iso(start+6*DAY)];}
 if(/^(this|next|last) month$/.test(text)){const offset=text.startsWith('next')?1:text.startsWith('last')?-1:0;return [iso(Date.UTC(y,m+offset,1)),iso(Date.UTC(y,m+offset+1,0))];}
 if(/^(this|next|last) year$/.test(text)){const year=y+(text.startsWith('next')?1:text.startsWith('last')?-1:0);return [`${year}-01-01`,`${year}-12-31`];}
 return null;
}
export function collectLabels(nodes,prefix='#'){const out=new Set();for(const n of nodes){if(n.codeLanguage)continue;const links=noteLinks(n.text);for(const m of n.text.matchAll(/(?:^|(?<=\s))([#@][\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu))if(m[0][0]===prefix&&!links.some(l=>m.index>=l.start&&m.index<l.end))out.add(m[0]);}return [...out].sort((a,b)=>a.localeCompare(b));}
export function searchMatcher(nodes,media=[],times={},now=Date.now()){
 const idx=new Map(nodes.map(n=>[n.id,n])),images=new Set(media.map(m=>m.bulletId)),incoming=new Set(nodes.filter(n=>!n.codeLanguage&&!n.mirrorSourceId).flatMap(n=>noteLinks(n.text).map(l=>l.id))),today=localDate(new Date(now)),parents=new Set(nodes.map(n=>n.parentId)),dateCache=new Map();
 const dates=n=>{if(dateCache.has(n.id))return dateCache.get(n.id);const values=new Set([n.dueDate,n.journalDate,...(n.codeLanguage?[]:[...n.text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]))].filter(validEventDate));let parent=n,seen=new Set();while(parent&&!seen.has(parent.id)){seen.add(parent.id);const d=parent.journalDate||/^journal-(\d{4}-\d{2}-\d{2})$/.exec(parent.id)?.[1];if(validEventDate(d))values.add(d);parent=idx.get(parent.parentId);}const result=[...values];dateCache.set(n.id,result);return result;};
 const term=(n,raw)=>{
  const colon=raw.indexOf(':'),field=colon>0?raw.slice(0,colon).toLowerCase():'',value=(colon>0?raw.slice(colon+1):raw).replace(/^"|"$/g,'').toLowerCase();
  if(['date','date-before','date-after'].includes(field)){const r=dateRange(value,today);return !!r&&dates(n).some(d=>field==='date'?d>=r[0]&&d<=r[1]:field==='date-before'?d<r[0]:d>r[1]);}
  if(field==='day-of-week'){const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];return dates(n).some(d=>days[new Date(stamp(d)).getUTCDay()].startsWith(value)&&value.length>=3);}
  if(['changed','last-changed','created'].includes(field)){const time=times[n.mirrorSourceId||n.id]?.[field==='created'?'createdAt':'updatedAt'];if(!time)return false;const duration=/^(\d+)([hdw])$/.exec(value);if(duration)return time>=now-Number(duration[1])*({'h':3600000,'d':DAY,'w':7*DAY}[duration[2]])&&time<=now;const r=dateRange(value,today);return !!r&&localDate(new Date(time))>=r[0]&&localDate(new Date(time))<=r[1];}
  if(field==='is')return ({complete:n.taskState==='DONE',todo:n.taskState==='TODO',task:n.taskState!=='NONE',mirror:!!n.mirrorSourceId,backlinks:incoming.has(n.mirrorSourceId||n.id),question:n.kind==='QUESTION',shared:n.shared===true,empty:!n.text.trim()})[value]===true;
  if(field==='has')return ({file:images.has(n.mirrorSourceId||n.id),image:images.has(n.mirrorSourceId||n.id),code:!!n.codeLanguage,date:dates(n).length>0,link:noteLinks(n.text).length>0,children:parents.has(n.id)})[value]===true;
  if(field==='text')return (n.formatting||'').toLowerCase().includes(value==='highlight'?'highlight':value);
  if(field==='highlight')return (n.formatting||'').toLowerCase().includes(value==='any'?'highlight':'highlight_'+value.replace('#',''));
  if(/^[@#][\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(value)){if(n.codeLanguage)return false;return collectLabels([n],value[0]).some(tag=>{const t=tag.toLowerCase();return t===value||(value[0]==='#'&&t.startsWith(value+'/'));});}
  if(field)return n.text.toLowerCase().includes(raw.toLowerCase());
  return n.text.toLowerCase().includes(value);
 };
 let previous=null,groups=[];
 return (n,query)=>{if(query!==previous){previous=query;let text=query.trim();if(!text){groups=[];return true;}if(dateRange(text,today))text=`date:"${text}"`;const tokens=text.match(/-?(?:[^\s"]*"[^"]*"|[^\s"]+)/g)||[];groups=[[]];for(const token of tokens){if(token==='OR')groups.push([]);else if(token!=='AND')groups.at(-1).push(token);}}return !query.trim()||groups.some(group=>group.length>0&&group.every(t=>t[0]==='-'?!term(n,t.slice(1)):term(n,t)));};
}
