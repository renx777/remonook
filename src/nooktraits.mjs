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
];
export const traitOwner=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(id)?.mirrorSourceId||id;
const node=(doc,id)=>snapshotIndex(doc.tables.bullets).byId.get(traitOwner(doc,id));
const store=doc=>doc.web?.nookTraits||{version:1,assignments:{},fields:{},schemas:{},views:{}};
const latest=events=>Object.entries(events||{}).filter(([,v])=>v&&Number.isSafeInteger(v.at)).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];
function revision(events,values,make=uuid,now=Date.now()){const id=make();if(!Number.isSafeInteger(now)||now<0||!id||events?.[id])throw Error('Could not save this trait edit.');return {...events,[id]:{...values,at:Math.max(now,(latest(events)?.at||0)+1)}};}
function change(doc,fn){const s=store(doc);if(s.version!==1)throw Error('Update RemoNook before editing these traits. Your data is retained.');return {...doc,web:{...doc.web,nookTraits:fn(s)}};}
export function traitTags(doc,id){const n=node(doc,id);if(!n||n.codeLanguage)return [];const code=marks(n.formatting||'',n.text.length).filter(m=>m.style==='CODE');return tagsInText(n.text).filter(t=>(t.key==='nooktraits'||t.key.startsWith('nooktraits/'))&&!code.some(m=>m.start<=t.start&&m.end>=t.end));}
export const traitsActive=(doc,id)=>traitTags(doc,id).length>0;
export function traitType(doc,id){const shortcut=traitTags(doc,id).map(t=>t.key.split('/')[1]).find(k=>TRAIT_TYPES.some(t=>t.id===k));return shortcut||latest(store(doc).assignments?.[traitOwner(doc,id)])?.type||'custom';}
export const traitTitle=text=>displayText(text).replace(/(^|\s)#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu,'$1').replace(/\s+/g,' ').trim()||'Untitled';
const fid=(type,f)=>f.key.startsWith('@')?f.key:`nook-${type}-${f.key}`;
const buildFields=type=>(TRAIT_TYPES.find(t=>t.id===type)?.fields||[]).map(f=>({id:fid(type,f),name:f.name,type:f.type,options:Object.fromEntries(f.options.map((label,i)=>[`${fid(type,f)}-option-${i}`,label])),starter:true}));
const presets=new Map(TRAIT_TYPES.map(t=>[t.id,buildFields(t.id)]));
const virtualFields=type=>presets.get(type)||[];
const definitionCache=new WeakMap(),emptyDefinitions={};
export const BUILTIN_TRAITS=[{id:'@due',name:'Due date',type:'date',builtin:true},{id:'@done',name:'Completed',type:'checkbox',builtin:true},{id:'@created',name:'Created',type:'datetime',readonly:true,builtin:true},{id:'@updated',name:'Updated',type:'datetime',readonly:true,builtin:true}];
export function allTraitDefinitions(doc){const key=doc.web?.noteProperties?.definitions||emptyDefinitions;if(definitionCache.has(key))return definitionCache.get(key);const defs=new Map([...TRAIT_TYPES.flatMap(t=>virtualFields(t.id)),...propertyDefinitions(doc,true),...BUILTIN_TRAITS].map(d=>[d.id,d]));const result=[...defs.values()].filter(d=>!d.archived);definitionCache.set(key,result);return result;}
export function resolveTraitField(doc,id,key){if(!key.startsWith('nook-')||propertyHistory(doc,id,key).length)return key;const d=allTraitDefinitions(doc).find(d=>d.id===key);if(!d||['select','multiselect'].includes(d.type))return key;const owner=traitOwner(doc,id);return allTraitDefinitions(doc).find(x=>!x.id.startsWith('nook-')&&!x.builtin&&x.name.toLowerCase()===d.name.toLowerCase()&&x.type===d.type&&(propertyHistory(doc,id,x.id).length||latest(store(doc).schemas?.[traitType(doc,id)]?.[x.id])?.attached===true)&&latest(store(doc).fields?.[owner]?.[x.id])?.attached!==false)?.id||key;}
export function traitFields(doc,id){const owner=traitOwner(doc,id),s=store(doc),kind=traitType(doc,id);const selected=new Set(virtualFields(kind).map(d=>d.id));
 for(const [key,value]of Object.entries(s.schemas?.[kind]||{}))if(latest(value)?.attached)selected.add(key);else selected.delete(key);
 for(const key of Object.keys(doc.web?.noteProperties?.values?.[owner]||{}))if(!key.startsWith('nook-')||key.startsWith('nook-'+kind+'-'))selected.add(key);
 for(const [key,value]of Object.entries(s.fields?.[owner]||{}))if(latest(value)?.attached)selected.add(key);else selected.delete(key);
 const defs=new Map(allTraitDefinitions(doc).map(d=>[d.id,d]));return [...new Set([...selected].map(key=>resolveTraitField(doc,id,key)))].map(key=>defs.get(key)).filter(Boolean);
}
export function traitValue(doc,id,field){const n=node(doc,id);if(field==='@due')return n?.dueDate||null;if(field==='@done')return !n||n.taskState==='NONE'?null:n.taskState==='DONE';if(field==='@created'||field==='@updated'){const time=doc.web.noteTimes?.[n?.id]?.[field==='@created'?'createdAt':'updatedAt'];return time?new Date(time).toISOString():null;}const key=resolveTraitField(doc,id,field),history=propertyHistory(doc,id,key);if(history.length)return history[0].value??null;if(n&&traitsActive(doc,id)){const kind=traitType(doc,id),preset=TRAIT_TYPES.find(t=>t.id===kind)?.fields.find(f=>fid(kind,f)===field);if(preset?.value!=null){const d=allTraitDefinitions(doc).find(d=>d.id===field);return d?(Object.keys(d.options||{}).find(k=>d.options[k]===preset.value)??preset.value):null;}}return null;}
export function activateTraits(doc,id){const n=node(doc,id);if(!n)throw Error('This note was removed.');if(n.codeLanguage)throw Error('Add NookTraits to an ordinary note, outside code.');if(traitsActive(doc,id))return doc;return withNodes(doc,doc.tables.bullets.map(x=>x.id===n.id?{...x,text:x.text+(x.text?' ':'')+'#nooktraits'}:x));}
function rewriteShortcuts(n,type,activeTags){const rs=activeTags.filter(t=>t.key.startsWith('nooktraits/')).map(t=>({...t,value:'#nooktraits/'+type}));if(!rs.length)return n;let text=n.text;for(const r of [...rs].reverse())text=text.slice(0,r.start)+r.value+text.slice(r.end);const pos=(at,end)=>{let delta=0;for(const r of rs){if(at<=r.start)break;if(at<r.end)return r.start+delta+(end?r.value.length:0);delta+=r.value.length-(r.end-r.start);}return at+delta;};return {...n,text,formatting:encode(marks(n.formatting||'',n.text.length).map(m=>({...m,start:pos(m.start,false),end:pos(m.end,true)})).filter(m=>m.end>m.start))};}
function ensureDefinition(doc,d,make=uuid,now=Date.now()){if(d.builtin||d.id.startsWith('@')||propertyDefinitions(doc,true).some(f=>f.id===d.id))return doc;const stable=[d.id,...Object.keys(d.options)];return createProperty(doc,{name:d.name,type:d.type,choices:Object.values(d.options)},()=>stable.shift()||make(),now).doc;}
export function applyTraitType(doc,id,type,make=uuid,now=Date.now(),options={}){if(!traitsActive(doc,id))throw Error('Add #nooktraits to activate this note first.');if(!TRAIT_TYPES.some(t=>t.id===type))throw Error('Choose a supported note type.');const owner=traitOwner(doc,id);let next=doc;
 if(options.rewriteTag!==false){const n=node(next,owner),mapped=rewriteShortcuts(n,type,traitTags(next,owner));if(mapped!==n)next=withNodes(next,next.tables.bullets.map(x=>x.id===owner?mapped:x));}
 for(const d of virtualFields(type))next=ensureDefinition(next,d,make,now);
 const s=store(next);if(latest(s.assignments?.[owner])?.type!==type)next=change(next,s=>({...s,assignments:{...s.assignments,[owner]:revision(s.assignments?.[owner],{type},make,now)}}));
 if(options.defaults!==false){const defaults={};for(const f of TRAIT_TYPES.find(t=>t.id===type).fields){const key=fid(type,f);if(f.value!==null&&!propertyHistory(next,owner,key).length){const d=allTraitDefinitions(next).find(d=>d.id===key);if(!d)continue;defaults[key]=Object.keys(d?.options||{}).find(k=>d.options[k]===f.value)??f.value;}}if(Object.keys(defaults).length)next=setPropertyValues(next,owner,defaults,make,now);}
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
export const traitViewPresets=type=>type==='book'?
 [{id:'all',name:'All'},{id:'toRead',name:'To read',status:'To read'},{id:'reading',name:'Reading',status:'Reading'},{id:'finished',name:'Finished',status:'Finished'}]:type==='movie'?
 [{id:'all',name:'All'},{id:'toWatch',name:'To watch',status:'To watch'},{id:'watching',name:'Watching',status:'Watching'},{id:'watched',name:'Watched',status:'Watched'}]:[{id:'all',name:'All'}];
export function traitView(doc,id,view='all'){
 const base={source:'children',type:'all',columns:null,filterField:'',operator:'equals',filterValue:'',filters:null,match:'all',sortField:'title',direction:'asc',layout:null,coverField:null,name:'',archived:false};
 return {...base,...latest(store(doc).views?.[traitOwner(doc,id)]?.[view])?.config};
}
export function traitViews(doc,id,type){
 const custom=Object.keys(store(doc).views?.[traitOwner(doc,id)]||{}).filter(key=>key.startsWith('saved-')).map(key=>({id:key,...traitView(doc,id,key)})).filter(v=>v.name&&!v.archived).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return [...traitViewPresets(type),...custom];
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
 if(!['children','descendants','workspace'].includes(config.source)||!['all',...TRAIT_TYPES.map(t=>t.id)].includes(config.type)||config.columns!==null&&(!Array.isArray(config.columns)||config.columns.length>64||config.columns.some(k=>typeof k!=='string'))||config.layout!==null&&!['grid','list','table'].includes(config.layout)||!['all','any'].includes(config.match)||config.filters!==null&&(!Array.isArray(config.filters)||config.filters.length>8||config.filters.some(f=>!f||typeof f.field!=='string'||typeof f.operator!=='string'||!['string','number','boolean'].includes(typeof f.value)))||typeof config.name!=='string'||config.name.length>60)throw Error('Choose valid collection settings.');
 return change(doc,s=>({...s,views:{...s.views,[owner]:{...s.views?.[owner],[view]:revision(s.views?.[owner]?.[view],{config},make,now)}}}));
}
export function saveTraitView(doc,id,name,config,preset='all',make=uuid,now=Date.now()){
 name=String(name).trim();if(!name||name.length>60)throw Error('Name the view using up to 60 characters.');
 if(traitViews(doc,id,config.type).filter(v=>v.id.startsWith('saved-')).length>=32)throw Error('Use up to 32 saved views per shelf.');
 const key='saved-'+make();if(store(doc).views?.[traitOwner(doc,id)]?.[key])throw Error('Could not create a unique view.');
 const filters=[...traitFilters(config)],status=traitViewPresets(config.type).find(v=>v.id===preset)?.status;
 if(status){const d=allTraitDefinitions(doc).find(d=>d.id===`nook-${config.type}-status`),value=Object.keys(d?.options||{}).find(k=>d.options[k]===status);if(value)filters.unshift({field:d.id,operator:'equals',value});}
 return {id:key,doc:updateTraitView(doc,id,key,{...config,name,archived:false,filters},make,now)};
}
export function collectionTraitDefinitions(doc,id,config,rows=[]){
 const relevant=new Set(rows.flatMap(n=>traitFields(doc,n.id).map(d=>d.id)));
 if(config.type!=='all'){for(const d of virtualFields(config.type))relevant.add(d.id);for(const [key,v]of Object.entries(store(doc).schemas?.[config.type]||{}))if(latest(v)?.attached)relevant.add(key);}
 for(const key of [...(config.columns||[]),...traitFilters(config).map(f=>f.field),config.sortField,config.coverField])if(key)relevant.add(key);
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
 const status=traitViewPresets(config.type).find(v=>v.id===preset)?.status;
 if(status){const d=allTraitDefinitions(doc).find(d=>d.id===`nook-${config.type}-status`);rows=rows.filter(n=>d?.options[traitValue(doc,n.id,d.id)]===status);}
 const filters=traitFilters(config).filter(f=>f.field&&(['empty','filled'].includes(f.operator)||f.value!==''));
 if(filters.length)rows=rows.filter(n=>config.match==='any'?filters.some(f=>matchesTraitFilter(doc,n,f)):filters.every(f=>matchesTraitFilter(doc,n,f)));
 const search=String(config.search||'').trim().toLowerCase();if(search)rows=rows.filter(n=>(traitTitle(n.text)+' '+traitSearchText(doc,n.id)).toLowerCase().includes(search));
 return rows.sort((a,b)=>{const av=config.sortField==='title'?traitTitle(a.text):traitValue(doc,a.id,config.sortField),bv=config.sortField==='title'?traitTitle(b.text):traitValue(doc,b.id,config.sortField);if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;const def=allTraitDefinitions(doc).find(d=>d.id===config.sortField);const label=v=>def?.type==='select'?def.options[v]||v:def?.type==='multiselect'?v?.map(k=>def.options[k]||k).join(', '):def?.type==='note'?traitTitle(node(doc,v)?.text||'Removed note'):v;const x=comparable(label(av)),y=comparable(label(bv));const order=typeof x==='number'&&typeof y==='number'?x-y:typeof x==='boolean'&&typeof y==='boolean'?Number(x)-Number(y):String(x??'').localeCompare(String(y??''));return order*(config.direction==='desc'?-1:1)||a.id.localeCompare(b.id);});
}
export function createTraitItem(doc,id,{title,type,config={},preset='all'},make=uuid,now=Date.now()){
 const parent=node(doc,id);if(!parent||!traitsActive(doc,id))throw Error('This shelf was removed or deactivated. Your draft is kept.');
 title=String(title).trim();if(!title||title.length>500)throw Error('Enter a title using up to 500 characters.');if(!TRAIT_TYPES.some(t=>t.id===type))throw Error('Choose a note type.');
 const key=make();if(!key||snapshotIndex(doc.tables.bullets).byId.has(key))throw Error('Could not create a unique note.');
 const position=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===parent.id).map(n=>n.position))+1;
 const added=bullet(key,{parentId:parent.id,position,text:title+' #nooktraits'+(type==='custom'?'':'/'+type)});
 let next=withNodes(doc,[...doc.tables.bullets.map(n=>n.id===parent.id?{...n,collapsed:false}:n),added]);next=applyTraitType(next,key,type,make,now,{rewriteTag:false});
 const defaults={},status=traitViewPresets(type).find(v=>v.id===preset)?.status;
 if(status){const d=allTraitDefinitions(next).find(d=>d.id===`nook-${type}-status`),value=Object.keys(d?.options||{}).find(k=>d.options[k]===status);if(value)defaults[d.id]=value;}
 if(config.match!=='any')for(const f of traitFilters(config)){const d=allTraitDefinitions(next).find(d=>d.id===f.field);if(f.operator==='equals'&&f.value!==''&&d&&!d.readonly){const value=d.type==='number'?Number(f.value):d.type==='checkbox'?f.value===true||f.value==='true':d.type==='multiselect'?[f.value]:f.value;if(validPropertyValue(d,value))defaults[d.id]=value;}}
 if(Object.keys(defaults).length)next=setTraitValues(next,key,defaults,make,now);
 return {doc:next,id:key};
}

export function traitSearchText(doc,id){if(!traitsActive(doc,id))return '';return [traitType(doc,id),...traitFields(doc,id).flatMap(d=>{const value=traitValue(doc,id,d.id);if(value===null)return [];const shown=d.type==='select'?d.options[value]:d.type==='multiselect'?value.map(k=>d.options[k]).join(' '):d.type==='note'?traitTitle(node(doc,value)?.text||''):String(value);return [d.name,shown];})].join(' ').toLowerCase();}
