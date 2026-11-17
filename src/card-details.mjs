import {snapshotIndex} from './outline-snapshot.mjs';
import {contentDigest} from './content-digest.mjs';import {mediaLinks} from './media.mjs';import {previewUrl} from './public-preview-url.mjs';
export function cardDetails(doc,id,url){if(!doc.web.linkPreviewDetails)return null;const node=snapshotIndex(doc.tables.bullets).byId.get(id),data=doc.web.linkPreviewDetails?.[node?.mirrorSourceId||id]?.[contentDigest(url)];return data&&['title','description','image','amount'].some(key=>data[key])?data:null;}
export function saveCardDetails(doc,id,url,input){
 const node=doc.tables.bullets.find(n=>n.id===id),source=node?.mirrorSourceId||id,current=doc.tables.bullets.find(n=>n.id===source);if(!node||!current)throw Error('This note was removed. Copy your details before closing.');
 if(!mediaLinks(current.text).some(link=>link.href===url))throw Error('The link changed while editing. Copy your details and reopen the card.');
 const existing=doc.web.linkPreviewDetails?.[source]?.[contentDigest(url)]||{};
 const keys=['title','description','image','amount','currency'];
 if(!keys.some(key=>Object.hasOwn(input,key)))return doc;
 const data=Object.fromEntries(keys.map(key=>[key,Object.hasOwn(input,key)?(typeof input[key]==='string'?input[key].trim():''):(existing[key]||'')]));
 if(data.title.length>250||data.description.length>360||data.image.length>2048)throw Error('Use a shorter title, description or image URL.');
 if(data.image)data.image=previewUrl(data.image).href;
 data.currency=data.currency.toUpperCase();if(data.amount&&(!/^\d{1,12}(?:\.\d{1,6})?$/.test(data.amount)||Number(data.amount)>=1e12||!/^[A-Z]{3}$/.test(data.currency)))throw Error('Enter a number and a three-letter currency code, such as INR, USD or EUR.');
 return {...doc,web:{...doc.web,linkPreviewDetails:{...doc.web.linkPreviewDetails,[source]:{...doc.web.linkPreviewDetails?.[source],[contentDigest(url)]:Object.fromEntries(Object.entries(data).filter(([key,value])=>value!==''||Object.hasOwn(existing,key)||Object.hasOwn(input,key)))}}}};
}
