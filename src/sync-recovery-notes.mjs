import {bullet} from './domain.mjs';

// Readable preservation in ordinary notes. The durable outbox recovery entry also
// retains exact binary operations, including deletions and unsupported fields.
export function recoveryNotes(doc, entries, id = crypto.randomUUID()) {
 if (!entries.length) return doc;
 const nodes=[...doc.tables.bullets],root='remonook-sync-recovery';
 if(!nodes.some(n=>n.id===root))nodes.push(bullet(root,{text:'Recovered from this device',position:Math.max(0,...nodes.filter(n=>!n.parentId).map(n=>n.position))+1}));
 const group='recovered-'+id;
 nodes.push(bullet(group,{parentId:root,text:'Content preserved during automatic sync repair',position:nodes.filter(n=>n.parentId===root).length}));
 let position=0;
 for(const entry of entries){
  const text=entry.label+'\n'+JSON.stringify(entry.value,null,2);
  for(let offset=0;offset<text.length;offset+=16000)nodes.push(bullet(group+'-'+position,{parentId:group,position:position++,text:text.slice(offset,offset+16000)}));
 }
 return {...doc,tables:{...doc.tables,bullets:nodes}};
}
