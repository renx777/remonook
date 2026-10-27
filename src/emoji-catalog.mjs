import {notoEmojis,getNotoEmoji,isNotoEmoji,notoPosterPath,NOTO_CREDIT_PATH,downloadNotoEmoji,notoAssetUrl} from './noto-emojis.mjs';
import {fluentEmojis,getFluentEmoji,isFluentEmoji,fluentPosterPath,FLUENT_CREDIT_PATH,downloadFluentEmoji,fluentAssetUrl} from './fluent-emojis.mjs';
export {fluentEmojis,notoEmojis};
export const getCatalogEmoji=token=>getNotoEmoji(token)||getFluentEmoji(token);
export const isCatalogEmoji=item=>isNotoEmoji(item)||isFluentEmoji(item);
export const catalogPosterPath=item=>isFluentEmoji(item)?fluentPosterPath(item):notoPosterPath(item);
export const catalogCreditPath=item=>isFluentEmoji(item)?FLUENT_CREDIT_PATH:NOTO_CREDIT_PATH;
export const catalogAssetPaths=item=>['emoji/'+item.fileName,...(isCatalogEmoji(item)?[catalogPosterPath(item),catalogCreditPath(item)]:[])];
export const downloadCatalogEmoji=(item,signal)=>isFluentEmoji(item)?downloadFluentEmoji(item,signal):downloadNotoEmoji(item,signal);
export const catalogAssetUrl=(item,poster=false)=>isFluentEmoji(item)?fluentAssetUrl(item,poster):notoAssetUrl(item,poster);
export const emojiCollection=item=>isFluentEmoji(item)?'fluent':isNotoEmoji(item)?'noto':'custom';
export const emojiCollectionLabel=item=>isFluentEmoji(item)?'Microsoft Fluent':isNotoEmoji(item)?'Google Noto':'My library';
// Share names between Unicode equivalents (e.g. Google's "Grin" and Microsoft's
// "Grinning face"), while retaining independent tokens and artwork.
const unicodeKey=item=>item.codepoint.split('_').filter(x=>x!=='fe0f').join('_');
const notoByCode=new Map(notoEmojis.map(item=>[unicodeKey(item),item])),fluentByCode=new Map(fluentEmojis.map(item=>[unicodeKey(item),item]));
// Alternate collections so equally ranked inline results give both artists space.
export const catalogEmojis=Array.from({length:Math.max(notoEmojis.length,fluentEmojis.length)},(_,i)=>[notoEmojis[i],fluentEmojis[i]]).flat().filter(Boolean).map(item=>{
 const counterpart=(isFluentEmoji(item)?notoByCode:fluentByCode).get(unicodeKey(item));
 return counterpart?{...item,searchLabels:[counterpart.label],tags:[...item.tags,...counterpart.tags,counterpart.label]}:item;
});
export const collectionFilters=[['all','All'],['noto','Google Noto'],['fluent','Microsoft Fluent']];
