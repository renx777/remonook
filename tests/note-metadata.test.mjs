import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet,encode,marks} from '../src/domain.mjs';
import {createProperty,propertyDefinitions,propertyValue,propertyHistory,setPropertyValues,renameProperty,validPropertyValue} from '../src/note-properties.mjs';
import {saveNoteTemplate,noteTemplates,instantiateNoteTemplate,archiveNoteTemplate} from '../src/note-templates.mjs';
import {Y,seed,sharedState,openShared,applyIntent,project} from '../src/sync-crdt.mjs';
const uuid=()=>crypto.randomUUID();
function fixture(){const d=empty();return {...d,tables:{...d.tables,bullets:[bullet('parent',{text:'My projects',collapsed:true}),bullet('existing',{parentId:'parent',text:'Keep me'}),bullet('source',{text:'{{title}}',formatting:encode([{start:0,end:9,style:'BOLD'}])}),bullet('child',{parentId:'source',text:'Read {{date}}',taskState:'DONE'})]}};}
test('seven property types retain false, zero, multi-select, dates and note links; invalid values do not mutate',()=>{
 let d=fixture();
 for(const [type,value] of [['text','multi\nline'],['number',0],['date','2028-02-29'],['checkbox',false],['select',null],['multiselect',[]],['note','parent']]){
  const r=createProperty(d,{name:type,type,choices:['First','Second']});d=r.doc;const def=propertyDefinitions(d).find(x=>x.id===r.id);
  const v=type==='select'?Object.keys(def.options)[0]:type==='multiselect'?Object.keys(def.options):value;
  d=setPropertyValues(d,'source',{[r.id]:v});assert.deepEqual(propertyValue(d,'source',r.id),v);
  assert.equal(setPropertyValues(d,'source',{[r.id]:v}),d);
 }
 const num=propertyDefinitions(d).find(x=>x.type==='number');assert.throws(()=>setPropertyValues(d,'source',{[num.id]:Infinity}));assert.equal(propertyValue(d,'source',num.id),0);
 assert.equal(validPropertyValue({type:'date'},'2026-02-29'),false);
 assert.throws(()=>setPropertyValues(d,'gone',{[num.id]:1}));
 const mirrored={...d,tables:{...d.tables,bullets:[...d.tables.bullets,bullet('mirror',{mirrorSourceId:'source'})]}};
 const changed=setPropertyValues(mirrored,'mirror',{[num.id]:4});assert.equal(propertyValue(changed,'source',num.id),4);
 const archived=renameProperty(changed,num.id,'Score',true);assert.ok(!propertyDefinitions(archived).some(x=>x.id===num.id));assert.equal(propertyHistory(archived,'source',num.id).length,2);
});
test('concurrent property edits converge while retaining both versions; different fields do not overwrite',()=>{
 let base=fixture();const p=createProperty(base,{name:'Status',type:'text'});base=p.doc;
 const root=seed(base),state=sharedState(root),a=openShared(state),b=openShared(state);
 try{
  const x=setPropertyValues(base,'source',{[p.id]:'From phone'},uuid,10),y=setPropertyValues(base,'source',{[p.id]:'From laptop'},uuid,10);
  applyIntent(a,base,x);applyIntent(b,base,y);Y.applyUpdate(a,Y.encodeStateAsUpdate(b));Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
  const da=project(a).doc,db=project(b).doc;assert.equal(propertyValue(da,'source',p.id),propertyValue(db,'source',p.id));
  assert.deepEqual(new Set(propertyHistory(da,'source',p.id).map(v=>v.value)),new Set(['From phone','From laptop']));
 }finally{root.destroy();a.destroy();b.destroy();}
});
test('saved templates insert independent children in append order, reset tasks, preserve marks and defaults',()=>{
 let d=fixture();const p=createProperty(d,{name:'Progress',type:'number'});d=setPropertyValues(p.doc,'source',{[p.id]:0});
 const saved=saveNoteTemplate(d,'source','Learning outline');d=saved.doc;
 const made=instantiateNoteTemplate(d,saved.id,'parent',{title:'A longer new heading'},uuid,new Date(2026,10,24,12).getTime());
 const n=made.doc.tables.bullets.find(n=>n.id===made.id),child=made.doc.tables.bullets.find(n=>n.parentId===made.id);
 assert.equal(n.text,'A longer new heading');assert.equal(n.parentId,'parent');assert.equal(n.position,1);assert.equal(made.doc.tables.bullets.find(n=>n.id==='parent').collapsed,false);
 assert.equal(child.text,'Read 2026-11-24');assert.equal(child.taskState,'TODO');assert.equal(child.dueDate,'');assert.equal(propertyValue(made.doc,n.id,p.id),0);
 assert.equal(made.doc.tables.bullets.find(n=>n.id==='child').taskState,'DONE');
 assert.equal(marks(n.formatting,n.text.length)[0].end,n.text.length);
 assert.equal(noteTemplates(made.doc).find(t=>t.id===saved.id).nodes[0].text,'{{title}}');
 const again=instantiateNoteTemplate(made.doc,saved.id,null,{title:'Another'});assert.notEqual(again.id,made.id);
 assert.equal(made.doc.tables.bullets.length,d.tables.bullets.length+2);
});
test('template updates preserve old versions; archived templates retain payload; specialized attachments reject honestly',()=>{
 const d=fixture(),s=saveNoteTemplate(d,'source','First'),updated=saveNoteTemplate(s.doc,'source','Second',uuid,s.id);
 assert.equal(Object.keys(updated.doc.web.noteTemplates[s.id].versions).length,2);
 const archived=archiveNoteTemplate(updated.doc,s.id);assert.ok(!noteTemplates(archived).some(t=>t.id===s.id));assert.ok(noteTemplates(archived,true).some(t=>t.id===s.id));
 const media={...d,tables:{...d.tables,media:[{bulletId:'child'}]}};assert.throws(()=>saveNoteTemplate(media,'source','Files'),/text-only/);
 assert.throws(()=>instantiateNoteTemplate(s.doc,s.id,'deleted',{title:'New'}),/removed/);
});
test('internal links in reusable templates point to fresh child IDs',()=>{
 const d=fixture();d.tables.bullets[2]={...d.tables.bullets[2],text:'See [[child|child]]',formatting:''};
 const saved=saveNoteTemplate(d,'source','Linked'),made=instantiateNoteTemplate(saved.doc,saved.id);
 const child=made.doc.tables.bullets.find(n=>n.parentId===made.id),root=made.doc.tables.bullets.find(n=>n.id===made.id);
 assert.ok(root.text.includes(child.id));assert.ok(!root.text.includes('@template/'));
});
test('templates and property histories survive the server projection acceptance check',async()=>{
 const {sharedSnapshot}=await import('../src/sync-validate.mjs');let d=fixture();const p=createProperty(d,{name:'Status',type:'text'});d=setPropertyValues(p.doc,'source',{[p.id]:'Draft'});d=setPropertyValues(d,'source',{[p.id]:'Reviewed'});const t=saveNoteTemplate(d,'source','Reusable outline');
 const y=seed(t.doc);try{const accepted=sharedSnapshot(y).doc;assert.equal(propertyHistory(accepted,'source',p.id).length,2);assert.equal(noteTemplates(accepted).find(n=>n.id===t.id).name,'Reusable outline');assert.equal(propertyValue(accepted,'source',p.id),'Reviewed');}finally{y.destroy();}
});
