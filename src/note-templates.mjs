import {bullet,index,marks,encode} from './domain.mjs';
import {sourceId,noteLinks,displayText} from './relations.mjs';
import {withNodes} from './workspace-nodes.mjs';
import {propertyDefinitions,propertyValue,propertyHistory,setPropertyValues} from './note-properties.mjs';
const item=(key,parent,text,extra={})=>({key,parent,text,formatting:'',...extra});
export const BUILTIN_NOTE_TEMPLATES=[
 {id:'builtin-meeting',name:'Meeting',description:'Agenda, decisions and clear next actions.',nodes:[item('root',null,'{{title}} · {{date}}'),item('agenda','root','Agenda'),item('notes','root','Discussion'),item('decisions','root','Decisions'),item('actions','root','Next actions'),item('task','actions','Follow up',{taskState:'TODO'})]},
 {id:'builtin-project',name:'Project',description:'Turn an outcome into milestones and next steps.',nodes:[item('root',null,'{{title}}'),item('outcome','root','Desired outcome'),item('context','root','Context and resources'),item('milestones','root','Milestones'),item('next','root','Next actions'),item('task','next','First step',{taskState:'TODO'})]},
 {id:'builtin-book',name:'Book notes',description:'Capture the ideas, questions and applications.',nodes:[item('root',null,'{{title}}'),item('author','root','Author: {{author}}'),item('summary','root','In my own words'),item('ideas','root','Key ideas'),item('quotes','root','Passages worth keeping'),item('questions','root','Questions'),item('apply','root','How I will use this')]},
 {id:'builtin-review',name:'Daily review',description:'A short pause to reflect and plan tomorrow.',nodes:[item('root',null,'Daily review · {{date}}'),item('wins','root','What went well?'),item('learned','root','What did I learn?'),item('open','root','Open loops'),item('tomorrow','root','Tomorrow’s priority')]},
 {id:'builtin-learning',name:'Learning note',description:'Build understanding before creating study cards.',nodes:[item('root',null,'{{title}}'),item('why','root','Why this matters'),item('explain','root','Explain it simply'),item('examples','root','Examples'),item('connections','root','Connections'),item('test','root','Questions to test my understanding')]},
];
const safe=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!['__proto__','constructor','prototype'].includes(id);
const templateVersion=t=>Object.entries(t.versions||{}).sort(([a,x],[b,y])=>y.at-x.at||b.localeCompare(a))[0]?.[1];
export const noteTemplates=(doc,includeArchived=false)=>[...BUILTIN_NOTE_TEMPLATES,...Object.values(doc.web?.noteTemplates||{}).filter(t=>t).map(t=>({...t,...templateVersion(t)})).filter(t=>Array.isArray(t.nodes)&&(includeArchived||!t.archived)).sort((a,b)=>a.name.localeCompare(b.name))];
/** @param {any} doc @param {string} id @param {string} name @param {()=>string} uuid @param {string|null} replaceId */
export function saveNoteTemplate(doc,id,name,uuid=()=>crypto.randomUUID(),replaceId=null,now=Date.now()){
 const root=sourceId(doc.tables.bullets,id),idx=index(doc.tables.bullets),source=idx.byId.get(root);name=String(name||'').trim();if(!source)throw Error('This note was removed.');if(!name||name.length>80)throw Error('Give the template a name up to 80 characters.');
 if(!replaceId&&Object.values(doc.web.noteTemplates||{}).filter(t=>!t.archived).length>=128)throw Error('Archive a saved template before adding another (128 active templates).');
 const branch=[],stack=[source];while(stack.length){const n=stack.pop();branch.push(n);stack.push(...[...(idx.children.get(n.id)||[])].reverse());if(branch.length>300)throw Error('Choose a branch with up to 300 bullets.');}
 const ids=new Map(branch.map((n,i)=>[n.id,'n'+i]));
 if(doc.tables.media.some(m=>branch.some(n=>n.id===m.bulletId||n.mirrorSourceId===m.bulletId))||branch.some(n=>doc.web.mcqs?.[n.id]||doc.web.occlusions?.[n.id]))throw Error('Choose a text-only branch for a template. Files and specialized study cards stay in the original note.');
 const defs=propertyDefinitions(doc,true);
 const nodes=branch.map(n=>{
  const renamed=rebase(n.text,n.formatting,noteLinks(n.text).filter(link=>ids.has(link.id)).map(link=>({start:link.start,end:link.end,value:`[[${link.label}|@template/${ids.get(link.id)}]]`})));
  const text=renamed.text;
  const fields={};for(const key of ['kind','listType','codeLanguage','blockStyle','bulletColor','dividerStyle','dividerColor','autoHighlight','collapsed'])if(n[key]!==undefined)fields[key]=n[key];
  const values=Object.fromEntries(defs.flatMap(d=>{const v=propertyValue(doc,n.id,d.id);return v===null&&!propertyHistory(doc,n.id,d.id).length?[]:[[d.id,d.type==='note'&&ids.has(v)?'@template/'+ids.get(v):v]];}));
  return {...fields,key:ids.get(n.id),parent:n.id===root?null:ids.get(n.parentId),text,formatting:renamed.formatting,taskState:n.taskState==='NONE'?'NONE':'TODO',properties:values};
 });
 const templateId=replaceId||uuid(),prior=doc.web.noteTemplates?.[templateId];
 if(replaceId&&!prior)throw Error('This saved template was removed. Save it as a new template instead.');
 const versionId=uuid(),previous=templateVersion(prior||{})?.at||0;
 const payload={name,description:displayText(source.text).slice(0,160),nodes,at:Math.max(now,previous+1)};
 const versions={...(prior?.versions||{}),...(!prior?.versions&&prior?{legacy:{name:prior.name,description:prior.description,nodes:prior.nodes,at:0}}:{}),[versionId]:payload};
 return {id:templateId,doc:{...doc,web:{...doc.web,noteTemplates:{...doc.web.noteTemplates,[templateId]:{id:templateId,archived:false,versions}}}}};
}
export function archiveNoteTemplate(doc,id,archived=true){const t=doc.web?.noteTemplates?.[id];if(!t)return doc;return {...doc,web:{...doc.web,noteTemplates:{...doc.web.noteTemplates,[id]:{...t,archived}}}};}
export function templateVariables(template){return [...new Set(template.nodes.flatMap(n=>[...n.text.matchAll(/\{\{([a-z][a-z0-9_-]*)\}\}/gi)].map(m=>m[1].toLowerCase())))].filter(n=>!['date','time'].includes(n));}
function substitutions(text,formatting,values){
 const replacements=[...text.matchAll(/\{\{([a-z][a-z0-9_-]*)\}\}/gi)].map(m=>({start:m.index,end:m.index+m[0].length,value:values[m[1].toLowerCase()]??m[0]}));
 return rebase(text,formatting,replacements);
}
function rebase(text,formatting,replacements){
 let result=text;for(const r of [...replacements].reverse())result=result.slice(0,r.start)+r.value+result.slice(r.end);
 const position=(at,end)=>{let delta=0;for(const r of replacements){if(at<=r.start)break;if(at<r.end)return r.start+delta+(end?r.value.length:0);delta+=r.value.length-(r.end-r.start);}return at+delta;};
 return {text:result,formatting:encode(marks(formatting||'',text.length).map(m=>({...m,start:position(m.start,false),end:position(m.end,true)})).filter(m=>m.end>m.start))};
}
/** @param {any} doc @param {string} templateId @param {string|null} parentId */
export function instantiateNoteTemplate(doc,templateId,parentId=null,variables={},uuid=()=>crypto.randomUUID(),now=Date.now()){
 const t=noteTemplates(doc).find(t=>t.id===templateId);if(!t)throw Error('This template is no longer available.');
 if(parentId!==null){parentId=sourceId(doc.tables.bullets,parentId);if(!doc.tables.bullets.some(n=>n.id===parentId))throw Error('The destination note was removed.');}
 if(!t.nodes.length||t.nodes.length>300||new Set(t.nodes.map(n=>n.key)).size!==t.nodes.length||t.nodes.filter(n=>n.parent===null).length!==1)throw Error('This template has an invalid structure. The original is kept.');
 const date=new Date(now),localDate=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const values={...variables,date:localDate,time:date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false})};
 for(const key of templateVariables(t))if(typeof values[key]!=='string'||values[key].length>2000)throw Error('Fill in '+key+' (up to 2,000 characters).');
 const ids=new Map(t.nodes.map(n=>[n.key,uuid()]));if([...ids.values()].some(id=>!safe(id)||doc.tables.bullets.some(n=>n.id===id))||new Set(ids.values()).size!==ids.size)throw Error('Could not allocate unique note IDs.');
 const added=[],counts=new Map();let root;
 const base=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===parentId).map(n=>n.position))+1;
 for(const n of t.nodes){
  if(n.parent!==null&&!ids.has(n.parent))throw Error('This template has a missing parent.');
  const value=substitutions(n.text,n.formatting,values);
  const remaps=noteLinks(value.text).filter(link=>link.id.startsWith('@template/')).map(link=>{const target=ids.get(link.id.slice(10));if(!target)throw Error('A template link has no destination.');return {start:link.start,end:link.end,value:`[[${link.label}|${target}]]`};});
  const mapped=rebase(value.text,value.formatting,remaps),text=mapped.text;
  const parent=n.parent===null?parentId:ids.get(n.parent),position=n.parent===null?base:(counts.get(n.parent)||0);counts.set(n.parent,position+1);
  const fields={};for(const key of ['kind','listType','codeLanguage','blockStyle','bulletColor','dividerStyle','dividerColor','autoHighlight','collapsed','taskState'])if(n[key]!==undefined)fields[key]=n[key];
  const id=ids.get(n.key);if(n.parent===null)root=id;
  added.push(bullet(id,{...fields,parentId:parent,position,text,formatting:mapped.formatting}));
 }
 let next=withNodes(doc,[...doc.tables.bullets.map(n=>n.id===parentId?{...n,collapsed:false}:n),...added]);
 for(const n of t.nodes){const defaults={};for(const [key,val]of Object.entries(n.properties||{})){if(!propertyDefinitions(next,true).some(d=>d.id===key))continue;defaults[key]=typeof val==='string'&&val.startsWith('@template/')?ids.get(val.slice(10)):val;}if(Object.keys(defaults).length)next=setPropertyValues(next,ids.get(n.key),defaults,uuid,now);}
 return {doc:next,id:root,count:added.length};
}
