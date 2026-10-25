import {galleryItems} from './gallery.mjs';
import {mediaLinks} from './media.mjs';
export const musicItems=(doc,id)=>galleryItems(doc,id).filter(m=>['audio','youtube','spotify'].includes(m.kind));
export function branchMedia(nodes,media){
 const parents=new Map(nodes.map(n=>[n.id,n.parentId])),result=new Map();
 const add=(id,kind)=>{const seen=new Set();while(id&&!seen.has(id)){seen.add(id);if(!result.has(id))result.set(id,new Set());result.get(id).add(kind);id=parents.get(id);}};
 for(const m of media)add(m.bulletId,(m.mimeType||'').startsWith('audio/')?'music':(m.mimeType||'').startsWith('video/')?'video':'image');
 for(const n of nodes)for(const m of mediaLinks(n.text))if(m.kind!=='link')add(n.id,m.kind==='audio'||m.kind==='spotify'?'music':m.kind==='image'?'image':m.kind==='youtube'?'youtube':'video');
 return result;
}
