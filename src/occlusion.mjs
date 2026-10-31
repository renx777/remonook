import {bullet} from './domain.mjs';
import {enableStudyBranch} from './study-library.mjs';
export function validMasks(masks){
 return Array.isArray(masks)&&masks.length>0&&masks.length<=100&&new Set(masks.map(m=>m?.id)).size===masks.length&&masks.every(m=>m&&typeof m.id==='string'&&m.id.length<=100&&typeof m.label==='string'&&m.label.length<=300&&['x','y','w','h'].every(k=>Number.isFinite(m[k]))&&m.x>=0&&m.y>=0&&m.w>=.01&&m.h>=.01&&m.x+m.w<=1.000001&&m.y+m.h<=1.000001);
}
export function validateOcclusions(value){
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>50000)throw Error('Invalid image occlusion data');
 for(const config of Object.values(value))if(!config||!validMasks(config.masks)||!['one','all'].includes(config.mode)||!['mediaId','groupId','maskId'].every(k=>typeof config[k]==='string')||!config.masks.some(m=>m.id===config.maskId))throw Error('Invalid image occlusion regions');
}
export function occlusionDefinition(doc,id){
 const config=doc.web?.occlusions?.[id];if(!config)return null;
 const media=doc.tables.media.find(m=>m.id===config.mediaId&&m.bulletId===id),node=doc.tables.bullets.find(n=>n.id===id);
 const valid=!!(node&&media&&validMasks(config.masks)&&config.masks.some(m=>m.id===config.maskId)&&['one','all'].includes(config.mode));
 return {...config,media,valid};
}
export function occlusionGroup(doc,groupId){return Object.entries(doc.web.occlusions||{}).filter(([id,c])=>c.groupId===groupId&&doc.tables.bullets.some(n=>n.id===id)).map(([id,config])=>({id,...config}));}
/** Creates actual outline questions, so topics, scheduling, history and card tools work normally. */
/** @param {any} doc @param {{mediaId:string,title:string,masks:any[],mode:string,deckId?:string|null,groupId?:string|null}} options */
export function applyOcclusion(doc,{mediaId,title,masks,mode,deckId=null,groupId=null},now=Date.now(),uuid=()=>crypto.randomUUID()){
 if(!validMasks(masks))throw Error('Draw between 1 and 100 regions, each at least 1% of the image.');
 if(!['one','all'].includes(mode))throw Error('Choose a valid hide mode.');
 title=String(title||'Image occlusion').trim().slice(0,200)||'Image occlusion';
 const image=doc.tables.media.find(m=>m.id===mediaId);if(!image)throw Error('The source image is no longer available.');
 if(!groupId&&deckId&&(!doc.tables.decks.some(d=>d.rootId===deckId)||doc.web.deckTypes?.[deckId]==='MCQ'))throw Error('Choose a flashcard deck.');
 const existing=groupId?occlusionGroup(doc,groupId):[],group=groupId?doc.tables.bullets.find(n=>n.id===groupId):null;
 if(groupId&&!group)throw Error('This image deck was removed. Close the editor and try again.');
 let nodes=[...doc.tables.bullets],media=[...doc.tables.media],decks=[...doc.tables.decks],configs={...doc.web.occlusions};
 const root=groupId||uuid();
 if(!group) {nodes.push(bullet(root,{parentId:deckId,collapsed:true,position:nodes.filter(n=>n.parentId===deckId).reduce((p,n)=>Math.max(p,n.position+1),0),text:title}));if(!deckId)decks.push({rootId:root,createdAt:now,pinned:0});}
 else nodes=nodes.map(n=>n.id===root?{...n,text:title}:n);
 if(group&&!group.parentId&&!decks.some(d=>d.rootId===root))decks.push({rootId:root,createdAt:now,pinned:0});
 const keep=new Set(masks.map(m=>m.id)),removed=new Set(existing.filter(c=>!keep.has(c.maskId)).map(c=>c.id));
 let changed=true;while(changed){changed=false;for(const n of nodes)if(removed.has(n.parentId)&&!removed.has(n.id)){removed.add(n.id);changed=true;}}
 nodes=nodes.filter(n=>!removed.has(n.id));media=media.filter(m=>!removed.has(m.bulletId));for(const id of removed)delete configs[id];
 for(let i=0;i<masks.length;i++){
  const mask=masks[i],prior=existing.find(c=>c.maskId===mask.id),id=prior?.id||uuid();let attachment=prior&&media.find(m=>m.id===prior.mediaId);
  const question=`${title} · Region ${i+1}`,answer=mask.label.trim()||`Region ${i+1} revealed`;
  if(prior){nodes=nodes.map(n=>n.id===id?{...n,text:question,position:i}:n);const answerNode=nodes.find(n=>n.parentId===id);if(answerNode)nodes=nodes.map(n=>n.id===answerNode.id?{...n,text:answer}:n);else nodes.push(bullet(uuid(),{parentId:id,text:answer,kind:'ANSWER'}));}
  else {nodes.push(bullet(id,{parentId:root,position:i,text:question,kind:'QUESTION'}),bullet(uuid(),{parentId:id,text:answer,kind:'ANSWER'}));}
  if(!attachment){attachment={...image,id:uuid(),bulletId:id};media.push(attachment);}
  configs[id]={groupId:root,mediaId:attachment.id,maskId:mask.id,masks:structuredClone(masks),mode};
 }
 return enableStudyBranch({...doc,tables:{...doc.tables,bullets:nodes,media,decks},web:{...doc.web,occlusions:configs}},root);
}

/** Normalized geometry stays inside the source image at every zoom level. */
export function adjustOcclusionMask(mask,patch){
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
 if(Object.values(patch).some(n=>!Number.isFinite(n)))return mask;
 const next={...mask,...patch};
 next.w=clamp(next.w,.01,1);next.h=clamp(next.h,.01,1);
 if('w' in patch&&!('x' in patch))next.w=Math.min(next.w,1-mask.x);
 if('h' in patch&&!('y' in patch))next.h=Math.min(next.h,1-mask.y);
 next.x=clamp(next.x,0,1-next.w);next.y=clamp(next.y,0,1-next.h);
 return next;
}
