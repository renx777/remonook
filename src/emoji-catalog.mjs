import {notoEmojis,getNotoEmoji,isNotoEmoji,notoPosterPath,NOTO_CREDIT_PATH,downloadNotoEmoji,notoAssetUrl} from './noto-emojis.mjs';
import {fluentEmojis,getFluentEmoji,isFluentEmoji,fluentPosterPath,FLUENT_CREDIT_PATH,downloadFluentEmoji,fluentAssetUrl} from './fluent-emojis.mjs';
import {staticEmojis,getStaticEmoji,isStaticEmoji,downloadStaticEmoji,staticAssetUrl} from './static-emojis.mjs';
export {fluentEmojis,notoEmojis,staticEmojis,isStaticEmoji};
export const getCatalogEmoji=token=>getNotoEmoji(token)||getFluentEmoji(token)||getStaticEmoji(token);
export const isCatalogEmoji=item=>isNotoEmoji(item)||isFluentEmoji(item)||isStaticEmoji(item);
export const catalogPosterPath=item=>isStaticEmoji(item)?'emoji/'+item.fileName:isFluentEmoji(item)?fluentPosterPath(item):notoPosterPath(item);
export const catalogCreditPath=item=>isStaticEmoji(item)?'emoji/'+item.fileName:isFluentEmoji(item)?FLUENT_CREDIT_PATH:NOTO_CREDIT_PATH;
export {catalogAssetPaths} from './emoji-asset-paths.mjs';
export const downloadCatalogEmoji=(item,signal)=>isStaticEmoji(item)?downloadStaticEmoji(item,signal):isFluentEmoji(item)?downloadFluentEmoji(item,signal):downloadNotoEmoji(item,signal);
export const catalogAssetUrl=(item,poster=false)=>isStaticEmoji(item)?staticAssetUrl(item):isFluentEmoji(item)?fluentAssetUrl(item,poster):notoAssetUrl(item,poster);
export const emojiCollection=item=>isStaticEmoji(item)?item.token.startsWith(':twemoji_')?'twemoji':'openmoji':isFluentEmoji(item)?'fluent':isNotoEmoji(item)?'noto':'custom';
const labels={noto:'Google Noto',fluent:'Microsoft Fluent',twemoji:'Twemoji',openmoji:'OpenMoji',custom:'My library'};
export const emojiCollectionLabel=item=>labels[emojiCollection(item)];
// Share search names across equivalent Unicode sequences while keeping artwork identities.
const unicodeKey=item=>item.codepoint.split('_').filter(x=>x!=='fe0f').join('_');
const packs=[notoEmojis,fluentEmojis,staticEmojis.filter(x=>x.pack==='twemoji'),staticEmojis.filter(x=>x.pack==='openmoji')];
const equivalents=new Map();
for(const pack of packs)for(const item of pack){const key=unicodeKey(item);if(!equivalents.has(key))equivalents.set(key,[]);equivalents.get(key).push(item);}
export const catalogEmojis=Array.from({length:Math.max(...packs.map(p=>p.length))},(_,i)=>packs.map(p=>p[i])).flat().filter(Boolean).map(item=>{
 const others=equivalents.get(unicodeKey(item)).filter(x=>x!==item);
 return {...item,searchLabels:[...new Set(others.map(x=>x.label))],tags:[...new Set([...item.tags,...others.flatMap(x=>[...x.tags,x.label])])]};
});
export const collectionFilters=[['all','All'],['noto','Google Noto'],['fluent','Microsoft Fluent'],['twemoji','Twemoji'],['openmoji','OpenMoji']];
