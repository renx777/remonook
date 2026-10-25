import {mediaLinks} from './media.mjs';
export function galleryItems(doc,id){
 const ids=new Set([id]);let more=true;while(more){more=false;for(const n of doc.tables.bullets)if(ids.has(n.parentId)&&!ids.has(n.id)){ids.add(n.id);more=true;}}
 const locals=doc.tables.media.filter(m=>ids.has(m.bulletId)).map(m=>({key:m.id,label:m.credit||m.fileName,kind:(m.mimeType||'').startsWith('audio/')||/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(m.fileName)?'audio':(m.mimeType||'').startsWith('video/')||/\.(mp4|webm|ogv)$/i.test(m.fileName)?'video':'image',local:m}));
 const links=doc.tables.bullets.filter(n=>ids.has(n.id)).flatMap(n=>mediaLinks(n.text).map(m=>({...m,title:n.text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/https?:\/\/\S+/g,'').trim().slice(0,100)||m.title}))).filter(m=>m.kind!=='link').map(m=>({key:m.href,label:m.title,kind:m.kind,href:m.href,embed:m.embed}));
 return [...new Map([...locals,...links].map(m=>[m.key,m])).values()];
}
