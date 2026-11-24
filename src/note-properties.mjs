import {sourceId} from './relations.mjs';
export const PROPERTY_TYPES=['text','number','date','checkbox','select','multiselect','note'];
const safe=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!['__proto__','constructor','prototype'].includes(id);
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const latest=events=>Object.entries(events||{}).filter(([,v])=>object(v)&&Number.isSafeInteger(v.at)).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];
export const propertyStore=doc=>doc.web?.noteProperties||{version:1,definitions:{},values:{}};
export function propertyDefinitions(doc,includeArchived=false){return Object.values(propertyStore(doc).definitions||{}).filter(d=>object(d)&&safe(d.id)&&PROPERTY_TYPES.includes(d.type)).map(d=>({...d,...latest(d.revisions),options:d.options||{}})).filter(d=>typeof d.name==='string'&&(includeArchived||!d.archived)).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));}
export const propertyOwner=(doc,id)=>sourceId(doc.tables.bullets,id);
export const propertyHistory=(doc,id,property)=>Object.entries(propertyStore(doc).values?.[propertyOwner(doc,id)]?.[property]||{}).map(([eventId,v])=>({...v,eventId})).filter(v=>object(v)&&Number.isSafeInteger(v.at)).sort((a,b)=>b.at-a.at||b.eventId.localeCompare(a.eventId));
export const propertyValue=(doc,id,property)=>propertyHistory(doc,id,property)[0]?.value??null;
function change(doc,fn){const current=propertyStore(doc);if(current.version!==1)throw Error("Update RemoNook before changing these properties. Existing data is kept.");const next=fn(current);if(next===current)return doc;return {...doc,web:{...doc.web,noteProperties:next}};}
function event(events,value,uuid,now){if(!Number.isSafeInteger(now)||now<0)throw Error('Check the device date and time.');const id=uuid();if(!safe(id)||events?.[id])throw Error('Could not create a unique property edit.');return {...events,[id]:{...value,at:Math.max(now,(latest(events)?.at||0)+1)}};}
export function createProperty(doc,{name,type,choices=[]},uuid=()=>crypto.randomUUID(),now=Date.now()){
 name=String(name||'').trim();if(!name||name.length>80||!PROPERTY_TYPES.includes(type))throw Error('Choose a name (up to 80 characters) and a property type.');
 if(propertyDefinitions(doc).length>=64)throw Error('Use up to 64 active properties per workspace. Archive one to add another.');
 if(choices.length>128||choices.some(c=>typeof c!=='string'||!c.trim()||c.length>80))throw Error('Use up to 128 named options.');
 const id=uuid();if(!safe(id)||propertyStore(doc).definitions?.[id])throw Error('Could not create a unique property.');
 const options={};for(const label of [...new Set(choices.map(c=>c.trim()))])options[uuid()]=label;
 return {id,doc:change(doc,s=>({...s,definitions:{...s.definitions,[id]:{id,type,options,revisions:event({}, {name,archived:false},uuid,now)}}}))};
}
export function renameProperty(doc,id,name,archived=false,uuid=()=>crypto.randomUUID(),now=Date.now()){
 const d=propertyStore(doc).definitions?.[id];name=String(name||'').trim();if(!d||!name||name.length>80)throw Error('Choose an existing property and a name up to 80 characters.');
 return change(doc,s=>({...s,definitions:{...s.definitions,[id]:{...d,revisions:event(d.revisions,{name,archived:!!archived},uuid,now)}}}));
}
export function addPropertyOption(doc,id,label,uuid=()=>crypto.randomUUID()){
 const d=propertyStore(doc).definitions?.[id];label=String(label||'').trim();if(!d||!['select','multiselect'].includes(d.type)||!label||label.length>80)throw Error('Give the option a name up to 80 characters.');
 if(Object.values(d.options||{}).includes(label))return doc;
 if(Object.keys(d.options||{}).length>=128)throw Error('Use up to 128 options.');
 return change(doc,s=>({...s,definitions:{...s.definitions,[id]:{...d,options:{...d.options,[uuid()]:label}}}}));
}
export function validPropertyValue(def,value){
 if(value===null)return true;
 switch(def.type){
  case 'text':return typeof value==='string'&&value.length<=8000;
  case 'number':return typeof value==='number'&&Number.isFinite(value);
  case 'date':try{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}
  case 'checkbox':return typeof value==='boolean';
  case 'select':return typeof value==='string'&&Object.hasOwn(def.options||{},value);
  case 'multiselect':return Array.isArray(value)&&value.length<=128&&new Set(value).size===value.length&&value.every(v=>typeof v==='string'&&Object.hasOwn(def.options||{},v));
  case 'note':return safe(value);
  default:return false;
 }
}
export function setPropertyValues(doc,id,values,uuid=()=>crypto.randomUUID(),now=Date.now()){
 const owner=propertyOwner(doc,id);if(!doc.tables.bullets.some(n=>n.id===owner))throw Error('This note was removed. Your form is still here.');
 const s=propertyStore(doc),defs=new Map(propertyDefinitions(doc,true).map(d=>[d.id,d]));let cells={...s.values?.[owner]},changed=false;
 for(const [key,value]of Object.entries(values)){
  const def=defs.get(key);if(!def||!validPropertyValue(def,value))throw Error('Enter a valid '+(def?.name||'property')+' value.');
  if(JSON.stringify(propertyValue(doc,owner,key))===JSON.stringify(value))continue;
  cells[key]=event(cells[key],{value},uuid,now);changed=true;
 }
 if(!changed)return doc;
 return change(doc,s=>({...s,values:{...s.values,[owner]:cells}}));
}
export function propertyDisplay(doc,def,value){
 if(value===null||value===undefined)return 'Not set';
 if(def.type==='checkbox')return value?'Yes':'No';
 if(def.type==='select')return def.options[value]||String(value);
 if(def.type==='multiselect')return Array.isArray(value)?value.map(v=>def.options[v]||v).join(', '):String(value);
 if(def.type==='note')return doc.tables.bullets.find(n=>n.id===value)?.text||'Removed note';
 return String(value);
}
