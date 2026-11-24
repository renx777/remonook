import {snapshotIndex} from './outline-snapshot.mjs';
import {marks,encode,bullet} from './domain.mjs';
import {displayText} from './relations.mjs';
import {tagsInText} from './tags.mjs';
import {withNodes} from './workspace-nodes.mjs';
import {createProperty,propertyDefinitions,propertyHistory,setPropertyValues,validPropertyValue} from './note-properties.mjs';
const uuid=()=>crypto.randomUUID();
const field=(key,name,type,options=[],value=null)=>({key,name,type,options,value});
export const TRAIT_TYPES=[
 {id:'custom',name:'Custom',fields:[]},
 {id:'book',name:'Book',fields:[field('author','Author','text'),field('status','Reading status','select',['To read','Reading','Finished'],'To read'),field('rating','Rating','number'),field('started','Started','date'),field('cover','Cover image','url'),field('year','Published year','number'),field('genre','Genre','text')]},
 {id:'project',name:'Project',fields:[field('status','Project status','select',['Planned','In progress','Done'],'Planned'),field('priority','Priority','select',['Low','Medium','High']),field('@due','Due date','date')]},
 {id:'meeting',name:'Meeting',fields:[field('date','Meeting date','date'),field('participants','Participants','text'),field('project','Project','note')]},
 {id:'movie',name:'Movie',fields:[field('director','Director','text'),field('status','Watch status','select',['To watch','Watching','Watched'],'To watch'),field('rating','Rating','number'),field('poster','Poster image','url'),field('year','Release year','number'),field('genre','Genre','text')]},
 {id:'person',name:'Person',fields:[field('role','Role','text'),field('organisation','Organisation','text'),field('website','Website','url')]},
 {id:'paper',name:'Research paper',fields:[field('authors','Authors','text'),field('year','Year','number'),field('source','Source','url')]},
 {id:'topic',name:'Topic',fields:[field('subject','Subject','select',['Physics','Chemistry','Biology','Mathematics','Other']),field('chapter','Chapter','text'),field('status','Revision status','select',['To learn','Learning','Revising','Mastered'],'To learn'),field('confidence','Confidence','select',['Low','Medium','High']),field('revised','Last revised','date'),field('next','Next revision','date'),field('weightage','Exam weightage %','number')]},
 {id:'lecture',name:'Lecture',fields:[field('course','Course','text'),field('teacher','Teacher','text'),field('date','Lecture date','date'),field('status','Lecture status','select',['To watch','Watched','Revised'],'To watch'),field('link','Lecture link','url'),field('duration','Duration (min)','number')]},
];
// Built-in types whose shelves get one tab per status option (Book and Movie keep their original tab ids).
const TAB_FIELDS={book:'status',movie:'status',project:'status',topic:'status',lecture:'status'};
export const traitOwner=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(id)?.mirrorSourceId||id;
const node=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(traitOwner(doc,id));
const store=doc=>doc.web?.nookTraits||{version:1,assignments:{},fields:{},schemas:{},views:{},types:{}};
const latest=events=>Object.entries(events||{}).filter(([,v])=>v&&Number.isSafeInteger(v.at)).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];
function revision(events,values,make=uuid,now=Date.now()){const id=make();if(!Number.isSafeInteger(now)||now<0||!id||events?.[id])throw Error('Could not save this trait edit.');return {...events,[id]:{...values,at:Math.max(now,(latest(events)?.at||0)+1)}};}
// ---- User-defined types: append-only revisions in web.nookTraits.types[typeId] ----
// Each revision holds {name, slug, fields:[definitionId], defaults:{definitionId:value}, tabField, archived}.
// The slug (the #nooktraits/<slug> shortcut) is fixed at creation so existing tags keep working after a rename.
const typeCache=new WeakMap(),noTypes={};
function customTypeIndex(doc){const raw=doc.web?.nookTraits?.types||noTypes;if(typeCache.has(raw))return typeCache.get(raw);const list=Object.entries(raw).map(([id,events])=>({id,...latest(events)})).filter(t=>typeof t.name==='string'&&t.name&&typeof t.slug==='string');const result={list,byId:new Map(list.map(t=>[t.id,t])),bySlug:new Map(list.map(t=>[t.slug,t]))};typeCache.set(raw,result);return result;}
export function customTraitTypes(doc,includeArchived=false){return customTypeIndex(doc).list.filter(t=>includeArchived||!t.archived).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));}
const builtinType=type=>TRAIT_TYPES.find(t=>t.id===type);
const customType=(doc,type)=>customTypeIndex(doc).byId.get(type);
export const isTraitType=(doc,type)=>!!builtinType(type)||!!customType(doc,type);
/** Every type a note can use: built-ins first (Custom last of them), then the workspace's own types. */
export function traitTypes(doc,includeArchived=false){const builtins=TRAIT_TYPES.filter(t=>t.id!=='custom').map(t=>({id:t.id,name:t.name,slug:t.id,builtin:true}));return [...builtins,...customTraitTypes(doc,includeArchived).map(t=>({...t,builtin:false})),{id:'custom',name:'Custom',slug:'custom',builtin:true}];}
export const traitTypeName=(doc,type)=>builtinType(type)?.name||customType(doc,type)?.name||'Custom';
export const traitTypeSlug=(doc,type)=>builtinType(type)?type:customType(doc,type)?.slug||'custom';
const slugify=name=>String(name).toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,40)||'type';
/** Field definition ids a type contributes (built-in presets or the user's chosen definitions). */
function typeFieldIds(doc,type){const b=builtinType(type);if(b)return (presets.get(type)||[]).map(d=>d.id);const t=customType(doc,type);return Array.isArray(t?.fields)?t.fields:[];}
function validTypeConfig(doc,cfg,selfId=null){
 const name=String(cfg.name||'').trim();if(!name||name.length>40)throw Error('Name the type using up to 40 characters.');
 const clash=traitTypes(doc,true).find(t=>t.id!==selfId&&!t.archived&&t.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(clash)throw Error(`A type called ${clash.name} already exists.`);
 const defs=new Map(allTraitDefinitions(doc).map(d=>[d.id,d]));const fields=[...new Set(cfg.fields||[])];
 if(fields.length>32||fields.some(f=>!defs.has(f)||defs.get(f).readonly))throw Error('Choose up to 32 existing, editable traits for this type.');
 const tabField=cfg.tabField||null;if(tabField&&(!fields.includes(tabField)||defs.get(tabField).type!=='select'))throw Error('Shelf tabs need a single-choice trait from this type.');
 const defaults={};for(const [k,v]of Object.entries(cfg.defaults||{})){if(!fields.includes(k))continue;const d=defs.get(k);if(v===null||v===''||!validPropertyValue(d,v))continue;defaults[k]=v;}
 return {name,fields,tabField,defaults,archived:!!cfg.archived};
}
export function createTraitType(doc,cfg,make=uuid,now=Date.now()){
 if(customTraitTypes(doc).length>=48)throw Error('Use up to 48 note types per workspace. Archive one to add another.');
 const clean=validTypeConfig(doc,cfg);const taken=new Set([...TRAIT_TYPES.map(t=>t.id),...customTypeIndex(doc).list.map(t=>t.slug),'nooktraits']);
 let slug=slugify(clean.name),n=2;while(taken.has(slug))slug=slugify(clean.name).slice(0,36)+'-'+n++;
 const id='type-'+make();if(store(doc).types?.[id])throw Error('Could not create a unique type.');
 return {id,doc:change(doc,s=>({...s,types:{...s.types,[id]:revision({},{...clean,slug},make,now)}}))};
}
export function updateTraitType(doc,id,patch,make=uuid,now=Date.now()){
 const t=customType(doc,id);if(!t)throw Error('Only your own note types can be edited.');
 const clean=validTypeConfig(doc,{...t,...patch},id);
 return change(doc,s=>({...s,types:{...s.types,[id]:revision(s.types?.[id],{...clean,slug:t.slug},make,now)}}));
}
function change(doc,fn){const s=store(doc);if(s.version!==1)throw Error('Update RemoNook before editing these traits. Your data is retained.');return {...doc,web:{...doc.web,nookTraits:fn(s)}};}
export function traitTags(doc,id){const n=node(doc,id);if(!n||n.codeLanguage)return [];const code=marks(n.formatting||'',n.text.length).filter(m=>m.style==='CODE');return tagsInText(n.text).filter(t=>(t.key==='nooktraits'||t.key.startsWith('nooktraits/'))&&!code.some(m=>m.start<=t.start&&m.end>=t.end));}
export const traitsActive=(doc,id)=>traitTags(doc,id).length>0;
export function traitType(doc,id){const keys=traitTags(doc,id).map(t=>t.key.split('/')[1]).filter(Boolean);const builtin=keys.find(k=>TRAIT_TYPES.some(t=>t.id===k));if(builtin)return builtin;const slugs=customTypeIndex(doc).bySlug;const own=keys.map(k=>slugs.get(k)).find(Boolean);if(own)return own.id;const assigned=latest(store(doc).assignments?.[traitOwner(doc,id)])?.type;return assigned&&isTraitType(doc,assigned)?assigned:'custom';}
export const traitTitle=text=>displayText(text).replace(/(^|\s)#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu,'$1').replace(/\s+/g,' ').trim()||'Untitled';
const fid=(type,f)=>f.key.startsWith('@')?f.key:`nook-${type}-${f.key}`;
const buildFields=type=>(TRAIT_TYPES.find(t=>t.id===type)?.fields||[]).map(f=>({id:fid(type,f),name:f.name,type:f.type,options:Object.fromEntries(f.options.map((label,i)=>[`${fid(type,f)}-option-${i}`,label])),starter:true}));
const presets=new Map(TRAIT_TYPES.map(t=>[t.id,buildFields(t.id)]));
const virtualFields=type=>presets.get(type)||[];
const definitionCache=new WeakMap(),emptyDefinitions={};
export const BUILTIN_TRAITS=[{id:'@due',name:'Due date',type:'date',builtin:true},{id:'@done',name:'Completed',type:'checkbox',builtin:true},{id:'@created',name:'Created',type:'datetime',readonly:true,builtin:true},{id:'@updated',name:'Updated',type:'datetime',readonly:true,builtin:true}];
export function allTraitDefinitions(doc){const key=doc.web?.noteProperties?.definitions||emptyDefinitions;if(definitionCache.has(key))return definitionCache.get(key);const defs=new Map([...TRAIT_TYPES.flatMap(t=>virtualFields(t.id)),...propertyDefinitions(doc,true),...BUILTIN_TRAITS].map(d=>[d.id,d]));const result=[...defs.values()].filter(d=>!d.archived);definitionCache.set(key,result);return result;}
export function resolveTraitField(doc,id,key){if(!key.startsWith('nook-')||propertyHistory(doc,id,key).length)return key;const d=allTraitDefinitions(doc).find(d=>d.id===key);if(!d||['select','multiselect'].includes(d.type))return key;const owner=traitOwner(doc,id);return allTraitDefinitions(doc).find(x=>!x.id.startsWith('nook-')&&!x.builtin&&x.name.toLowerCase()===d.name.toLowerCase()&&x.type===d.type&&(propertyHistory(doc,id,x.id).length||latest(store(doc).schemas?.[traitType(doc,id)]?.[x.id])?.attached===true)&&latest(store(doc).fields?.[owner]?.[x.id])?.attached!==false)?.id||key;}
export function traitFields(doc,id){const owner=traitOwner(doc,id),s=store(doc),kind=traitType(doc,id);const selected=new Set(typeFieldIds(doc,kind));
 for(const [key,value]of Object.entries(s.schemas?.[kind]||{}))if(latest(value)?.attached)selected.add(key);else selected.delete(key);
 for(const key of Object.keys(doc.web?.noteProperties?.values?.[owner]||{}))if(!key.startsWith('nook-')||key.startsWith('nook-'+kind+'-'))selected.add(key);
 for(const [key,value]of Object.entries(s.fields?.[owner]||{}))if(latest(value)?.attached)selected.add(key);else selected.delete(key);
 const defs=new Map(allTraitDefinitions(doc).map(d=>[d.id,d]));return [...new Set([...selected].map(key=>resolveTraitField(doc,id,key)))].map(key=>defs.get(key)).filter(Boolean);
}
export function traitValue(doc,id,field){const n=node(doc,id);if(field==='@due')return n?.dueDate||null;if(field==='@done')return !n||n.taskState==='NONE'?null:n.taskState==='DONE';if(field==='@created'||field==='@updated'){const time=doc.web.noteTimes?.[n?.id]?.[field==='@created'?'createdAt':'updatedAt'];return time?new Date(time).toISOString():null;}const key=resolveTraitField(doc,id,field),history=propertyHistory(doc,id,key);if(history.length)return history[0].value??null;if(n&&traitsActive(doc,id)){const kind=traitType(doc,id);const own=customType(doc,kind);if(own&&Object.hasOwn(own.defaults||{},field))return own.defaults[field];const preset=TRAIT_TYPES.find(t=>t.id===kind)?.fields.find(f=>fid(kind,f)===field);if(preset?.value!=null){const d=allTraitDefinitions(doc).find(d=>d.id===field);return d?(Object.keys(d.options||{}).find(k=>d.options[k]===preset.value)??preset.value):null;}}return null;}
export function activateTraits(doc,id){const n=node(doc,id);if(!n)throw Error('This note was removed.');if(n.codeLanguage)throw Error('Add NookTraits to an ordinary note, outside code.');if(traitsActive(doc,id))return doc;return withNodes(doc,doc.tables.bullets.map(x=>x.id===n.id?{...x,text:x.text+(x.text?' ':'')+'#nooktraits'}:x));}
function rewriteShortcuts(n,slug,activeTags){const rs=activeTags.filter(t=>t.key.startsWith('nooktraits/')).map(t=>({...t,value:'#nooktraits/'+slug}));if(!rs.length)return n;let text=n.text;for(const r of [...rs].reverse())text=text.slice(0,r.start)+r.value+text.slice(r.end);const pos=(at,end)=>{let delta=0;for(const r of rs){if(at<=r.start)break;if(at<r.end)return r.start+delta+(end?r.value.length:0);delta+=r.value.length-(r.end-r.start);}return at+delta;};return {...n,text,formatting:encode(marks(n.formatting||'',n.text.length).map(m=>({...m,start:pos(m.start,false),end:pos(m.end,true)})).filter(m=>m.end>m.start))};}
function ensureDefinition(doc,d,make=uuid,now=Date.now()){if(d.builtin||d.id.startsWith('@')||propertyDefinitions(doc,true).some(f=>f.id===d.id))return doc;const stable=[d.id,...Object.keys(d.options)];return createProperty(doc,{name:d.name,type:d.type,choices:Object.values(d.options)},()=>stable.shift()||make(),now).doc;}
export function applyTraitType(doc,id,type,make=uuid,now=Date.now(),options={}){if(!traitsActive(doc,id))throw Error('Add #nooktraits to activate this note first.');if(!isTraitType(doc,type))throw Error('Choose a supported note type.');const owner=traitOwner(doc,id);let next=doc;
 if(options.rewriteTag!==false){const n=node(next,owner),mapped=rewriteShortcuts(n,traitTypeSlug(next,type),traitTags(next,owner));if(mapped!==n)next=withNodes(next,next.tables.bullets.map(x=>x.id===owner?mapped:x));}
 for(const d of virtualFields(type))next=ensureDefinition(next,d,make,now);
 const s=store(next);if(latest(s.assignments?.[owner])?.type!==type)next=change(next,s=>({...s,assignments:{...s.assignments,[owner]:revision(s.assignments?.[owner],{type},make,now)}}));
 if(options.defaults!==false&&customType(next,type)){const own=customType(next,type),defaults={};for(const [key,value]of Object.entries(own.defaults||{}))if(!propertyHistory(next,owner,key).length)defaults[key]=value;if(Object.keys(defaults).length)next=setPropertyValues(next,owner,defaults,make,now);}
 else if(options.defaults!==false){const defaults={};for(const f of TRAIT_TYPES.find(t=>t.id===type).fields){const key=fid(type,f);if(f.value!==null&&!propertyHistory(next,owner,key).length){const d=allTraitDefinitions(next).find(d=>d.id===key);if(!d)continue;defaults[key]=Object.keys(d?.options||{}).find(k=>d.options[k]===f.value)??f.value;}}if(Object.keys(defaults).length)next=setPropertyValues(next,owner,defaults,make,now);}
 return next;
}
export function attachTraitField(doc,id,field,attached=true,shared=false,make=uuid,now=Date.now()){if(!traitsActive(doc,id))throw Error('Add #nooktraits to activate this note first.');const d=allTraitDefinitions(doc).find(d=>d.id===field);if(!d)throw Error('This trait is unavailable.');const equivalents=!attached&&!shared?virtualFields(traitType(doc,id)).filter(f=>f.id!==field&&resolveTraitField(doc,id,f.id)===field).map(f=>f.id):[];let next=ensureDefinition(doc,d,make,now);const owner=traitOwner(doc,id),group=shared?'schemas':'fields',key=shared?traitType(doc,id):owner;
 if(latest(store(next)[group]?.[key]?.[field])?.attached===attached)return next;
 next=change(next,s=>({...s,[group]:{...s[group],[key]:{...s[group]?.[key],[field]:revision(s[group]?.[key]?.[field],{attached},make,now)}}}));for(const alias of equivalents)next=attachTraitField(next,id,alias,false,false,make,now);return next;
}
export function setTraitValues(doc,id,values,make=uuid,now=Date.now()){if(!traitsActive(doc,id))throw Error('NookTraits was deactivated. Your draft is kept. Add the tag again to save.');const owner=traitOwner(doc,id);let next=doc;const normal={};let patch={};
 for(const [key,value]of Object.entries(values)){const d=allTraitDefinitions(next).find(d=>d.id===key);if(!d||d.readonly||!validPropertyValue(d,value)||(d.id==='nook-book-rating'||d.id==='nook-movie-rating')&&value!==null&&(value<0||value>5))throw Error('Enter a valid '+(d?.name||'trait')+' value.');next=ensureDefinition(next,d,make,now);if(key==='@due')patch.dueDate=value||'';else if(key==='@done')patch.taskState=value===null?'NONE':value?'DONE':'TODO';else normal[resolveTraitField(next,id,key)]=value;const actual=resolveTraitField(next,id,key);if(!traitFields(next,id).some(f=>f.id===actual))next=attachTraitField(next,id,actual,true,false,make,now);}
 if(Object.keys(normal).length)next=setPropertyValues(next,owner,normal,make,now);
 if(Object.keys(patch).length&&Object.entries(patch).some(([k,v])=>node(next,owner)[k]!==v))next=withNodes(next,next.tables.bullets.map(n=>n.id===owner?{...n,...patch}:n));return next;
}
export function setTraitsBulk(doc,ids,field,value,make=uuid,now=Date.now()){let next=doc;const owners=[...new Set(ids.map(id=>traitOwner(doc,id)))];if(!owners.length||owners.some(id=>!node(doc,id)||!traitsActive(doc,id)))throw Error('Select activated NookTraits notes. No changes were applied.');for(const id of owners)next=setTraitValues(next,id,{[field]:value},make,now);return next;}
/** Shelf tabs: All plus one tab per option of the type's status-like field. `field` is the
 *  definition filtered on and `status` the option label. Book and Movie keep their original ids. */
export function traitViewPresets(type,doc){
 if(type==='book')return [{id:'all',name:'All'},{id:'toRead',name:'To read',status:'To read',field:'nook-book-status'},{id:'reading',name:'Reading',status:'Reading',field:'nook-book-status'},{id:'finished',name:'Finished',status:'Finished',field:'nook-book-status'}];
 if(type==='movie')return [{id:'all',name:'All'},{id:'toWatch',name:'To watch',status:'To watch',field:'nook-movie-status'},{id:'watching',name:'Watching',status:'Watching',field:'nook-movie-status'},{id:'watched',name:'Watched',status:'Watched',field:'nook-movie-status'}];
 const b=builtinType(type);if(b&&TAB_FIELDS[type]){const f=b.fields.find(f=>f.key===TAB_FIELDS[type]);return [{id:'all',name:'All'},...f.options.map((label,i)=>({id:`${type}-tab-${i}`,name:label,status:label,field:fid(type,f)}))];}
 const own=doc&&customType(doc,type);if(own?.tabField){const d=allTraitDefinitions(doc).find(d=>d.id===own.tabField);if(d)return [{id:'all',name:'All'},...Object.entries(d.options||{}).map(([key,label])=>({id:'tab-'+key,name:String(label),status:String(label),field:d.id}))];}
 return [{id:'all',name:'All'}];
}
const presetValue=(doc,preset)=>{if(!preset?.field)return null;const d=allTraitDefinitions(doc).find(d=>d.id===preset.field);const value=Object.keys(d?.options||{}).find(k=>d.options[k]===preset.status);return d&&value?{field:d.id,value}:null;};
export function traitView(doc,id,view='all'){
 const base={source:'children',type:'all',columns:null,filterField:'',operator:'equals',filterValue:'',filters:null,match:'all',sortField:'title',direction:'asc',layout:null,coverField:null,groupField:null,name:'',archived:false};
 return {...base,...latest(store(doc).views?.[traitOwner(doc,id)]?.[view])?.config};
}
export function traitViews(doc,id,type){
 const custom=Object.keys(store(doc).views?.[traitOwner(doc,id)]||{}).filter(key=>key.startsWith('saved-')).map(key=>({id:key,...traitView(doc,id,key)})).filter(v=>v.name&&!v.archived).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return [...traitViewPresets(type,doc),...custom];
}
export function traitOperators(type){
 const basic=[['equals','Is'],['not','Is not']];
 return [...basic,...(['text','url','multiselect'].includes(type)?[['contains','Contains']]:[]),...(['number','date','datetime'].includes(type)?[['gt',type==='number'?'Greater than':'After'],['lt',type==='number'?'Less than':'Before']]:[]),['empty','Is empty'],['filled','Has a value']];
}
export function traitFilters(config){
 return Array.isArray(config.filters)?config.filters:config.filterField?[{field:config.filterField,operator:config.operator,value:config.filterValue}]:[];
}
export function updateTraitView(doc,id,view,patch,make=uuid,now=Date.now()){
 if(!traitsActive(doc,id))throw Error('Activate NookTraits before editing this collection.');
 const owner=traitOwner(doc,id),config={...traitView(doc,id,view),...patch};
 if(!['children','descendants','workspace'].includes(config.source)||!(config.type==='all'||isTraitType(doc,config.type))||config.columns!==null&&(!Array.isArray(config.columns)||config.columns.length>64||config.columns.some(k=>typeof k!=='string'))||config.layout!==null&&!['grid','list','table'].includes(config.layout)||config.groupField!==null&&typeof config.groupField!=='string'||!['all','any'].includes(config.match)||config.filters!==null&&(!Array.isArray(config.filters)||config.filters.length>8||config.filters.some(f=>!f||typeof f.field!=='string'||typeof f.operator!=='string'||!['string','number','boolean'].includes(typeof f.value)))||typeof config.name!=='string'||config.name.length>60)throw Error('Choose valid collection settings.');
 return change(doc,s=>({...s,views:{...s.views,[owner]:{...s.views?.[owner],[view]:revision(s.views?.[owner]?.[view],{config},make,now)}}}));
}
export function saveTraitView(doc,id,name,config,preset='all',make=uuid,now=Date.now()){
 name=String(name).trim();if(!name||name.length>60)throw Error('Name the view using up to 60 characters.');
 if(traitViews(doc,id,config.type).filter(v=>v.id.startsWith('saved-')).length>=32)throw Error('Use up to 32 saved views per shelf.');
 const key='saved-'+make();if(store(doc).views?.[traitOwner(doc,id)]?.[key])throw Error('Could not create a unique view.');
 const filters=[...traitFilters(config)],tab=presetValue(doc,traitViewPresets(config.type,doc).find(v=>v.id===preset));
 if(tab)filters.unshift({field:tab.field,operator:'equals',value:tab.value});
 return {id:key,doc:updateTraitView(doc,id,key,{...config,name,archived:false,filters},make,now)};
}
export function collectionTraitDefinitions(doc,id,config,rows=[]){
 const relevant=new Set(rows.flatMap(n=>traitFields(doc,n.id).map(d=>d.id)));
 if(config.type!=='all'){for(const key of typeFieldIds(doc,config.type))relevant.add(key);for(const [key,v]of Object.entries(store(doc).schemas?.[config.type]||{}))if(latest(v)?.attached)relevant.add(key);}
 for(const key of [...(config.columns||[]),...traitFilters(config).map(f=>f.field),config.sortField,config.coverField,config.groupField])if(key)relevant.add(key);
 return allTraitDefinitions(doc).filter(d=>d.builtin||relevant.has(d.id)||!d.id.startsWith('nook-'));
}
const comparable=v=>typeof v==='string'?v.toLocaleLowerCase():v;
function matchesTraitFilter(doc,n,f){
 const def=allTraitDefinitions(doc).find(d=>d.id===f.field);if(!def)return false;
 const v=traitValue(doc,n.id,f.field),raw=f.value,target=def.type==='number'?Number(raw):def.type==='checkbox'?raw===true||raw==='true':raw;
 switch(f.operator){
  case 'empty':return v===null||v===''||Array.isArray(v)&&!v.length;
  case 'filled':return !(v===null||v===''||Array.isArray(v)&&!v.length);
  case 'contains':return Array.isArray(v)?v.includes(target):String(v??'').toLowerCase().includes(String(target).toLowerCase());
  case 'gt':return v!==null&&v>target;
  case 'lt':return v!==null&&v<target;
  case 'not':return Array.isArray(v)?!v.includes(target):def.type==='text'?comparable(v)!==comparable(target):v!==target;
  default:return Array.isArray(v)?v.includes(target):def.type==='text'?comparable(v)===comparable(target):v===target;
 }
}
export function queryTraits(doc,id,config,preset='all'){
 const owner=traitOwner(doc,id),idx=snapshotIndex(doc.tables.bullets),under=new Set();
 if(config.source==='descendants'){const stack=[...(idx.children.get(owner)||[])];while(stack.length){const n=stack.pop();if(under.has(n.id))continue;under.add(n.id);stack.push(...(idx.children.get(n.id)||[]));}}
 let rows=doc.tables.bullets.filter(n=>n.id!==owner&&!n.mirrorSourceId&&traitsActive(doc,n.id)&&(config.source==='workspace'||config.source==='children'&&n.parentId===owner||config.source==='descendants'&&under.has(n.id))&&(config.type==='all'||traitType(doc,n.id)===config.type));
 const tab=traitViewPresets(config.type,doc).find(v=>v.id===preset);
 if(tab?.field){const d=allTraitDefinitions(doc).find(d=>d.id===tab.field);rows=rows.filter(n=>d?.options[traitValue(doc,n.id,d.id)]===tab.status);}
 const filters=traitFilters(config).filter(f=>f.field&&(['empty','filled'].includes(f.operator)||f.value!==''));
 if(filters.length)rows=rows.filter(n=>config.match==='any'?filters.some(f=>matchesTraitFilter(doc,n,f)):filters.every(f=>matchesTraitFilter(doc,n,f)));
 const search=String(config.search||'').trim().toLowerCase();if(search)rows=rows.filter(n=>(traitTitle(n.text)+' '+traitSearchText(doc,n.id)).toLowerCase().includes(search));
 return rows.sort((a,b)=>{const av=config.sortField==='title'?traitTitle(a.text):traitValue(doc,a.id,config.sortField),bv=config.sortField==='title'?traitTitle(b.text):traitValue(doc,b.id,config.sortField);if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;const def=allTraitDefinitions(doc).find(d=>d.id===config.sortField);const label=v=>def?.type==='select'?def.options[v]||v:def?.type==='multiselect'?v?.map(k=>def.options[k]||k).join(', '):def?.type==='note'?traitTitle(node(doc,v)?.text||'Removed note'):v;const x=comparable(label(av)),y=comparable(label(bv));const order=typeof x==='number'&&typeof y==='number'?x-y:typeof x==='boolean'&&typeof y==='boolean'?Number(x)-Number(y):String(x??'').localeCompare(String(y??''));return order*(config.direction==='desc'?-1:1)||a.id.localeCompare(b.id);});
}
export function createTraitItem(doc,id,{title,type,config={},preset='all'},make=uuid,now=Date.now()){
 const parent=node(doc,id);if(!parent||!traitsActive(doc,id))throw Error('This shelf was removed or deactivated. Your draft is kept.');
 title=String(title).trim();if(!title||title.length>500)throw Error('Enter a title using up to 500 characters.');if(!isTraitType(doc,type))throw Error('Choose a note type.');
 const key=make();if(!key||snapshotIndex(doc.tables.bullets).byId.has(key))throw Error('Could not create a unique note.');
 const position=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===parent.id).map(n=>n.position))+1;
 const added=bullet(key,{parentId:parent.id,position,text:title+' #nooktraits'+(type==='custom'?'':'/'+traitTypeSlug(doc,type))});
 let next=withNodes(doc,[...doc.tables.bullets.map(n=>n.id===parent.id?{...n,collapsed:false}:n),added]);next=applyTraitType(next,key,type,make,now,{rewriteTag:false});
 const defaults={},tab=presetValue(next,traitViewPresets(type,next).find(v=>v.id===preset));
 if(tab)defaults[tab.field]=tab.value;
 if(config.match!=='any')for(const f of traitFilters(config)){const d=allTraitDefinitions(next).find(d=>d.id===f.field);if(f.operator==='equals'&&f.value!==''&&d&&!d.readonly){const value=d.type==='number'?Number(f.value):d.type==='checkbox'?f.value===true||f.value==='true':d.type==='multiselect'?[f.value]:f.value;if(validPropertyValue(d,value))defaults[d.id]=value;}}
 if(Object.keys(defaults).length)next=setTraitValues(next,key,defaults,make,now);
 return {doc:next,id:key};
}

export function traitSearchText(doc,id){if(!traitsActive(doc,id))return '';return [traitTypeName(doc,traitType(doc,id)),...traitFields(doc,id).flatMap(d=>{const value=traitValue(doc,id,d.id);if(value===null)return [];const shown=d.type==='select'?d.options[value]:d.type==='multiselect'?value.map(k=>d.options[k]).join(' '):d.type==='note'?traitTitle(node(doc,value)?.text||''):String(value);return [d.name,shown];})].join(' ').toLowerCase();}

// ---- Presentation helpers shared by shelves and export ----
const RATED=new Set(['nook-book-rating','nook-movie-rating']);
/** A value as people read it: option labels, Yes/No, linked note titles, ratings out of 5. */
export function traitDisplay(doc,d,v){
 if(v===null||v===undefined||v===''||Array.isArray(v)&&!v.length)return 'Not set';
 if(d.type==='datetime')return new Date(v).toLocaleString();if(RATED.has(d.id))return v+' / 5';
 if(d.type==='checkbox')return v?'Yes':'No';if(d.type==='select')return d.options?.[v]||String(v);
 if(d.type==='multiselect')return Array.isArray(v)?v.map(k=>d.options?.[k]||k).join(', '):String(v);
 if(d.type==='note')return traitTitle(node(doc,v)?.text||'Removed note');return String(v);
}
/** Traits that can group a shelf: single choice, checkbox, and the canonical Completed flag. */
export const groupableTraits=defs=>defs.filter(d=>['select','checkbox'].includes(d.type));
/** Splits rows (already sorted) into groups by a trait, in option order with Not set last. */
export function groupTraitRows(doc,rows,field){
 const d=allTraitDefinitions(doc).find(d=>d.id===field);if(!d)return [{key:'',label:'',rows}];
 const order=d.type==='select'?Object.keys(d.options||{}):d.type==='checkbox'?[true,false]:[];const groups=new Map();
 for(const n of rows){const v=traitValue(doc,n.id,field);const key=v===null||v===undefined||v===''?'\u0000none':JSON.stringify(v);if(!groups.has(key))groups.set(key,{key,value:v,label:v===null||v===undefined||v===''?'Not set':traitDisplay(doc,d,v),rows:[]});groups.get(key).rows.push(n);}
 const rank=g=>g.key==='\u0000none'?1e9:order.length?order.findIndex(o=>JSON.stringify(o)===g.key):0;
 return [...groups.values()].sort((a,b)=>rank(a)-rank(b)||a.label.localeCompare(b.label));
}
/** One-line summary for a column: average and total for numbers, counts otherwise. */
export function traitSummary(doc,rows,d){
 const values=rows.map(n=>traitValue(doc,n.id,d.id)).filter(v=>!(v===null||v===undefined||v===''||Array.isArray(v)&&!v.length));
 if(d.type==='number'&&values.length){const sum=values.reduce((a,b)=>a+b,0),avg=sum/values.length,f=x=>Number.isInteger(x)?String(x):x.toFixed(1);return `Avg ${f(avg)} · Sum ${f(sum)}`;}
 if(d.type==='checkbox')return `${values.filter(v=>v===true).length} of ${rows.length}`;
 return `${values.length} of ${rows.length} set`;
}
/** CSV of a shelf: note title then one column per visible trait, as displayed. */
export function traitsCsv(doc,rows,columns){
 const cell=v=>{const s=String(v??'');return /[",\n\r]/.test(s)||/^[=+\-@\t]/.test(s)?'"'+(/^[=+\-@\t]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"':s;};
 const head=['Note',...columns.map(d=>d.name)].map(cell).join(',');
 return [head,...rows.map(n=>[traitTitle(n.text),...columns.map(d=>{const v=traitValue(doc,n.id,d.id);return v===null?'':traitDisplay(doc,d,v);})].map(cell).join(','))].join('\r\n')+'\r\n';
}
/** Columns a new shelf shows before the person picks: the type's first few non-image traits. */
export function defaultTraitColumns(doc,type,union=[]){
 if(type==='book')return ['nook-book-author','nook-book-status','nook-book-rating'];
 if(type==='movie')return ['nook-movie-director','nook-movie-status','nook-movie-rating'];
 const defs=new Map(allTraitDefinitions(doc).map(d=>[d.id,d]));const pool=type==='all'?union:typeFieldIds(doc,type);
 return pool.filter(k=>defs.has(k)&&!(defs.get(k).type==='url'&&/cover|poster|image/i.test(defs.get(k).name))).slice(0,4);
}
