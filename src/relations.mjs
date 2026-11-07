import {namedTagColor} from './tags.mjs';
import {bullet,index,descendants,move} from './domain.mjs';
export const contentFields=['text','formatting','kind','autoHighlight','listType','codeLanguage','taskState','dueDate','blockStyle','dividerStyle','dividerColor'];
export function sourceId(nodes,id){return nodes.find(n=>n.id===id)?.mirrorSourceId||id;}
export function noteLinks(text){if(!text.includes('[['))return [];return [...text.matchAll(/\[\[([^\]\n|]*)\|([^\]\n|]+)\]\]/g)].map(m=>({start:m.index,end:m.index+m[0].length,label:m[1],id:m[2],raw:m[0]}));}
export function internalLink(node){return `[[${(node.text||'Untitled').replace(/[\[\]|\n]/g,' ').slice(0,120)}|${node.id}]]`;}
export function backlinks(nodes,id){const target=sourceId(nodes,id);return nodes.filter(n=>!n.mirrorSourceId&&noteLinks(n.text).some(l=>l.id===target));}
export function mirrorLocations(nodes,id){const target=sourceId(nodes,id);return nodes.filter(n=>n.mirrorRootId===n.id&&n.mirrorSourceId===target);}
export function displayText(text){if(!text.includes('[['))return text;return text.replace(/\[\[([^\]\n|]*)\|([^\]\n|]+)\]\]/g,(_,label)=>label||'Untitled');}
export function notePath(nodes,id,idx=index(nodes)){const parts=[];let n=idx.byId.get(id),seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);parts.unshift(displayText(n.text)||'Untitled');n=idx.byId.get(n.parentId);}return parts.join(' › ');}
export function tagColor(tag){const named=namedTagColor(tag);if(named)return named;const key=tag.toLowerCase().split('/')[0];if(['#imp','#important','#urgent'].includes(key))return '#e88c87';if(['#todo','#pending'].includes(key))return '#d8b666';if(['#done','#complete'].includes(key))return '#81bda1';const palette=['#83b8db','#b6a0d8','#d29aba','#8cbbac','#c9ad85'];let hash=0;for(const c of key)hash=(hash*31+c.charCodeAt(0))>>>0;return palette[hash%palette.length];}
export const hasImportantTag=text=>/(?:^|\s)#(?:imp|important|urgent)(?![\p{L}\p{N}_-])/iu.test(text.replace(/\[\[([^\]\n|]*)\|([^\]\n|]+)\]\]/g,''));
export function syncMirrors(previous,nodes){
 if(!nodes.some(n=>n.mirrorSourceId)&&!previous.some(n=>n.mirrorSourceId))return nodes.slice();
 const prior=new Map(previous.map(n=>[n.id,n]));let result=nodes.slice(),idx=index(result);
 // Content edits made through any instance update the canonical bullet.
 for(const n of nodes){if(!n.mirrorSourceId||!idx.byId.has(n.mirrorSourceId))continue;const before=prior.get(n.id);if(!before)continue;const patch={};for(const field of contentFields)if(n[field]!==before[field])patch[field]=n[field];if(Object.keys(patch).length){result=result.map(s=>s.id===n.mirrorSourceId?{...s,...patch}:s);}}
 idx=index(result);
 const roots=result.filter(n=>n.mirrorRootId===n.id&&n.mirrorSourceId);
 for(const root of roots){
  const old=result.filter(n=>n.mirrorRootId===root.id),source=idx.byId.get(root.mirrorSourceId);
  if(!source){result=result.map(n=>n.mirrorRootId===root.id?Object.fromEntries(Object.entries(n).filter(([k])=>!['mirrorSourceId','mirrorRootId'].includes(k))):n);continue;}
  if(source.mirrorSourceId)throw Error('Choose the original bullet as the mirror source.');
  const branch=descendants(result,source.id);
  if(branch.has(root.id)||branch.has(root.parentId))throw Error('A mirror cannot be placed inside its own source branch.');
  if(result.some(n=>branch.has(n.id)&&n.mirrorSourceId))throw Error('A mirrored source cannot contain another mirror. Move or detach the nested mirror first.');
  const bySource=new Map(old.map(n=>[n.mirrorSourceId,n])),ids=new Map([[source.id,root.id]]);
  for(const n of result)if(branch.has(n.id)&&n.id!==source.id)ids.set(n.id,bySource.get(n.id)?.id||crypto.randomUUID());
  const clones=result.filter(n=>branch.has(n.id)).map(n=>({...n,id:ids.get(n.id),parentId:n.id===source.id?root.parentId:ids.get(n.parentId),position:n.id===source.id?root.position:n.position,collapsed:bySource.get(n.id)?.collapsed??n.collapsed,mirrorSourceId:n.id,mirrorRootId:root.id}));
  result=[...result.filter(n=>n.mirrorRootId!==root.id),...clones];idx=index(result);
 }
 return result;
}
export function createMirror(nodes,atId,fromId){
 const idx=index(nodes),at=idx.byId.get(atId),source=idx.byId.get(sourceId(nodes,fromId));
 if(!at||!source)throw Error('The selected bullet no longer exists.');
 if(at.mirrorSourceId)throw Error('Create mirrors in a regular bullet.');
 const empty=!at.text&&!at.codeLanguage&&!(idx.children.get(at.id)||[]).length;
 const id=empty?at.id:crypto.randomUUID(),siblings=idx.children.get(at.parentId)||[];
 let next=empty?nodes.map(n=>n.id===id?{...n,mirrorSourceId:source.id,mirrorRootId:id}:n):move([...nodes,bullet(id,{mirrorSourceId:source.id,mirrorRootId:id})],id,at.parentId,siblings.findIndex(n=>n.id===at.id)+1);
 next=syncMirrors(nodes,next);return {nodes:next,id};
}
export function detachMirror(nodes,id){const node=nodes.find(n=>n.id===id),root=node?.mirrorRootId;if(!root)return nodes;return nodes.map(n=>n.mirrorRootId===root?Object.fromEntries(Object.entries(n).filter(([k])=>!['mirrorSourceId','mirrorRootId'].includes(k))):n);}
export function validateMirrors(nodes){const idx=index(nodes);for(const n of nodes){if(!n.mirrorSourceId&&!n.mirrorRootId)continue;if(typeof n.mirrorSourceId!=='string'||typeof n.mirrorRootId!=='string'||!idx.byId.has(n.mirrorSourceId)||idx.byId.get(n.mirrorRootId)?.mirrorRootId!==n.mirrorRootId)throw Error('Invalid mirror reference in backup.');}syncMirrors(nodes,nodes);}

export function matchesQuery(text,query){const q=query.trim().toLowerCase();if(!/^#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(q))return text.toLowerCase().includes(q);const links=noteLinks(text);return [...text.matchAll(/(?:^|(?<=\s))(#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu)].some(m=>{const t=m[0].toLowerCase();return (t===q||t.startsWith(q+'/'))&&!links.some(l=>m.index>=l.start&&m.index<l.end);});}
/** Row classes for built-in smart tags (styling only; the tag text stays in the note). */
const SMART_TAGS=[['tag-done',/#(?:done|complete)/],['tag-later',/#(?:later|someday)/],['tag-key',/#(?:key|highlight)/],['tag-private',/#private/]];
export function smartTagClasses(text){if(!text||!text.includes('#'))return '';const plain=text.replace(/\[\[([^\]\n|]*)\|([^\]\n|]+)\]\]/g,'');return SMART_TAGS.filter(([,re])=>new RegExp(`(?:^|\\s)${re.source}(?![\\p{L}\\p{N}_/-])`,'iu').test(plain)).map(([c])=>c).join(' ');}
