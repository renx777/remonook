// Inbox is an ordinary outline branch, shared by desktop capture, Android shares and widgets.
// Processing always reads the current workspace and uses the normal outline mutation path.
import {bullet,index,move,descendants} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';
import {INBOX_ID} from './quick-capture.mjs';
import {internalLink,noteLinks} from './relations.mjs';
import {traitBulletIds} from './traits-block.mjs';
import {calendarEvents,saveCalendarEvent} from './calendar-events.mjs';
export {INBOX_ID};
export const inboxItems=doc=>(index(doc.tables.bullets).children.get(INBOX_ID)||[]);
export const inboxReminderId=id=>'inbox-reminder-'+id;
export function startInboxCapture(doc,id=crypto.randomUUID(),text=''){
 if(doc.tables.bullets.some(n=>n.id===id))throw Error('This capture already exists.');
 let nodes=doc.tables.bullets;
 if(!nodes.some(n=>n.id===INBOX_ID))nodes=[bullet(INBOX_ID,{text:'Inbox'}),...nodes.map(n=>n.parentId===null?{...n,position:n.position+1}:n)];
 const position=Math.max(-1,...nodes.filter(n=>n.parentId===INBOX_ID).map(n=>n.position))+1;
 return {doc:withNodes(doc,[...nodes,bullet(id,{parentId:INBOX_ID,position,text})]),id};
}
export function inboxDestinations(doc,query=''){
 const nodes=doc.tables.bullets,idx=index(nodes),excluded=descendants(nodes,INBOX_ID),traits=traitBulletIds(nodes),q=query.trim().toLocaleLowerCase();
 return nodes.filter(n=>!excluded.has(n.id)&&!traits.has(n.id)&&!n.mirrorSourceId&&!n.mirrorRootId).map(n=>{
  const parts=[],seen=new Set();let at=idx.byId.get(n.parentId);
  while(at&&!seen.has(at.id)){seen.add(at.id);parts.unshift(at.text||'Untitled');at=idx.byId.get(at.parentId);}
  return {id:n.id,title:n.text||'Untitled',path:parts.join(' / ')||'My notes'};
 }).filter(n=>!q||(n.title+' '+n.path).toLocaleLowerCase().includes(q));
}
export function processInbox(doc,id,action,uuid=()=>crypto.randomUUID()){
 const nodes=doc.tables.bullets,idx=index(nodes),node=idx.byId.get(id);
 if(!node||node.parentId!==INBOX_ID)throw Error('This capture was moved or removed. Reopen it from its current location.');
 if(node.mirrorSourceId||node.mirrorRootId)throw Error('Open the mirror source to process this note.');
 if(action.kind==='task')return node.taskState!=='NONE'?doc:withNodes(doc,nodes.map(n=>n.id===id?{...n,taskState:'TODO'}:n));
 if(action.kind==='schedule'){
  const prior=calendarEvents(doc).find(e=>e.id===inboxReminderId(id));
  return saveCalendarEvent(doc,{...(prior||{title:(node.text.trim()||'Inbox note').slice(0,160),kind:'other',repeat:'none',leadDays:1,notes:internalLink(node),countdown:false}),id:prior?.id,date:action.date,time:action.time||''},()=>inboxReminderId(id));
 }
 if(!['file','link'].includes(action.kind))throw Error('Unknown Inbox action.');
 const target=action.target===null?null:idx.byId.get(action.target);
 if(action.target!==null&&!target)throw Error('The destination was removed. Choose another note.');
 if(action.kind==='link'&&!target)throw Error('Choose a note to link.');
 if(target&&(descendants(nodes,INBOX_ID).has(target.id)||traitBulletIds(nodes).has(target.id)||target.mirrorSourceId||target.mirrorRootId))throw Error('Choose a destination outside the Inbox, Traits and mirrored branches.');
 if(action.kind==='file'){
  const parentId=target?.id||null,at=(idx.children.get(parentId)||[]).length;
  return withNodes(doc,move(nodes,id,parentId,at).map(n=>n.id===parentId?{...n,collapsed:false}:n));
 }
 const existing=(idx.children.get(id)||[]).some(n=>noteLinks(n.text).some(link=>link.id===target.id));
 if(existing)return doc;
 const child=bullet(uuid(),{parentId:id,position:(idx.children.get(id)||[]).length,text:internalLink(target)});
 return withNodes(doc,[...nodes.map(n=>n.id===id?{...n,collapsed:false}:n),child]);
}
