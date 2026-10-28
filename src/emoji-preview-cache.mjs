import {downloadCatalogEmoji,getCatalogEmoji} from './emoji-catalog.mjs';
const maximum=16*1024*1024, entries=new Map();let bytes=0;
export function cachedEmojiPreview(token){
 const entry=entries.get(token);if(!entry)return null;
 entries.delete(token);entries.set(token,entry);return new Map(entry.files);
}
export async function loadEmojiPreview(item,signal){
 const known=getCatalogEmoji(item.token);if(!known)throw Error('Unknown preview emoji');
 const cached=cachedEmojiPreview(known.token);if(cached)return cached;
 const files=await downloadCatalogEmoji(known,signal);
 if(signal.aborted)throw new DOMException('Preview cancelled','AbortError');
 const size=[...files.values()].reduce((sum,blob)=>sum+blob.size,0);
 if(size<=maximum){
  const prior=entries.get(known.token);if(prior){bytes-=prior.size;entries.delete(known.token);}
  while(bytes+size>maximum&&entries.size){const key=entries.keys().next().value;bytes-=entries.get(key).size;entries.delete(key);}
  entries.set(known.token,{files:new Map(files),size});bytes+=size;
 }
 return files;
}
