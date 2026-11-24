import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {createProperty} from '../src/note-properties.mjs';
import {traitType,traitFields,traitValue,applyTraitType,setTraitValues,createTraitType,updateTraitType,customTraitTypes,traitTypes,traitTypeSlug,traitViewPresets,traitViews,queryTraits,createTraitItem,updateTraitView,traitView,saveTraitView,groupTraitRows,traitSummary,traitsCsv,defaultTraitColumns,traitSearchText,allTraitDefinitions} from '../src/nooktraits.mjs';

let n=0;const make=()=>'id'+(++n);
function base(){const d=empty();return {...d,tables:{...d.tables,bullets:[bullet('shelf',{parentId:null,position:0,text:'Recipes #nooktraits #views'}),bullet('r1',{parentId:'shelf',position:0,text:'Dal tadka #nooktraits'}),bullet('r2',{parentId:'shelf',position:1,text:'Poha #nooktraits/recipe'}),bullet('t1',{parentId:null,position:1,text:'Kinematics #nooktraits/topic'})]}};}
function recipeType(){let d=base();const time=createProperty(d,{name:'Cook time (min)',type:'number'},make);d=time.doc;const stage=createProperty(d,{name:'Stage',type:'select',choices:['Want to try','Tried','Favourite']},make);d=stage.doc;
 const want=Object.entries(allTraitDefinitions(d).find(x=>x.id===stage.id).options).find(([,v])=>v==='Want to try')[0];
 const made=createTraitType(d,{name:'Recipe',fields:[time.id,stage.id],tabField:stage.id,defaults:{[stage.id]:want}},make,1000);return {d:made.doc,type:made.id,time:time.id,stage:stage.id,want};}

test('user-defined types: create, resolve by tag shortcut or assignment, defaults and fields', ()=>{
  const {d:start,type,time,stage,want}=recipeType();
  assert.equal(traitTypeSlug(start,type),'recipe');
  assert.equal(traitType(start,'r2'),type,'#nooktraits/recipe resolves to the user type');
  assert.equal(traitType(start,'r1'),'custom');
  let d=applyTraitType(start,'r1',type,make,2000);
  assert.equal(traitType(d,'r1'),type);
  assert.deepEqual(traitFields(d,'r1').map(f=>f.id).sort(),[time,stage].sort());
  assert.equal(traitValue(d,'r1',stage),want,'type default fills a never-edited cell');
  d=setTraitValues(d,'r1',{[stage]:null},make,3000);d=applyTraitType(d,'r1',type,make,4000);
  assert.equal(traitValue(d,'r1',stage),null,'an explicit clear is kept when the type is applied again');
  assert.match(traitSearchText(d,'r1'),/recipe/,'search finds the type name');
  assert.ok(traitTypes(d).some(t=>t.id===type&&!t.builtin));
});

test('renaming keeps the tag shortcut; archived types keep working for existing notes', ()=>{
  const {d:start,type}=recipeType();
  let d=updateTraitType(start,type,{name:'Kitchen recipe'},make,2000);
  assert.equal(traitTypeSlug(d,type),'recipe');assert.equal(traitType(d,'r2'),type);
  d=updateTraitType(d,type,{archived:true},make,3000);
  assert.ok(!customTraitTypes(d).some(t=>t.id===type),'hidden from pickers');
  assert.equal(traitType(d,'r2'),type,'existing tagged notes keep their fields');
  assert.throws(()=>createTraitType(d,{name:'Topic',fields:[]},make),/already exists/,'built-in names are reserved');
  assert.throws(()=>createTraitType(d,{name:'Bad',fields:['@created']},make),/editable traits/);
  assert.throws(()=>updateTraitType(d,'book',{name:'X'},make),/your own/);
  const second=createTraitType(d,{name:'Recipe',fields:[]},make,4000);assert.equal(traitTypeSlug(second.doc,second.id),'recipe-2','slugs stay unique');
});

test('concurrent edits to a type converge on the latest revision', ()=>{
  const {d:start,type}=recipeType();
  const a=updateTraitType(start,type,{name:'Recipe A'},()=> 'ev-a',5000),b=updateTraitType(start,type,{name:'Recipe B'},()=> 'ev-b',6000);
  const merged={...a,web:{...a.web,nookTraits:{...a.web.nookTraits,types:{[type]:{...a.web.nookTraits.types[type],...b.web.nookTraits.types[type]}}}}};
  assert.equal(customTraitTypes(merged).find(t=>t.id===type).name,'Recipe B');
  assert.equal(Object.keys(merged.web.nookTraits.types[type]).length,3,'both revisions are kept');
});

test('status tabs work for user types and new built-ins; New items adopt the tab', ()=>{
  const {d:start,type,stage}=recipeType();
  let d=applyTraitType(start,'r1',type,make,2000);d=applyTraitType(d,'r2',type,make,2100);
  const tabs=traitViewPresets(type,d);assert.deepEqual(tabs.map(t=>t.name),['All','Want to try','Tried','Favourite']);
  const tried=tabs.find(t=>t.name==='Tried');
  d=updateTraitView(d,'shelf','all',{type},make,2200);
  assert.equal(queryTraits(d,'shelf',traitView(d,'shelf','all'),tried.id).length,0);
  const made=createTraitItem(d,'shelf',{title:'Masala dosa',type,config:traitView(d,'shelf','all'),preset:tried.id},make,2300);
  const item=made.doc.tables.bullets.find(x=>x.id===made.id);
  assert.equal(item.text,'Masala dosa #nooktraits/recipe');
  assert.equal(queryTraits(made.doc,'shelf',traitView(made.doc,'shelf','all'),tried.id).map(x=>x.id).join(),made.id);
  assert.deepEqual(traitViewPresets('topic',d).map(t=>t.name),['All','To learn','Learning','Revising','Mastered']);
  assert.deepEqual(traitViewPresets('book',d).map(t=>t.id),['all','toRead','reading','finished'],'Book keeps its original tab ids');
  const saved=saveTraitView(made.doc,'shelf','Tried only',traitView(made.doc,'shelf','all'),tried.id,make,2400);
  assert.ok(traitViews(saved.doc,'shelf',type).some(v=>v.name==='Tried only'));
});

test('Topic starter for students', ()=>{
  let d=applyTraitType(base(),'t1','topic',make,1000);
  const names=traitFields(d,'t1').map(f=>f.name);
  for(const want of ['Subject','Chapter','Revision status','Confidence','Last revised','Next revision','Exam weightage %'])assert.ok(names.includes(want),want);
  const status=allTraitDefinitions(d).find(x=>x.id==='nook-topic-status');assert.equal(status.options[traitValue(d,'t1','nook-topic-status')],'To learn');
});

test('grouping, summaries and CSV export', ()=>{
  const {d:start,type,time,stage}=recipeType();
  let d=applyTraitType(start,'r1',type,make,2000);d=applyTraitType(d,'r2',type,make,2100);
  const fav=Object.entries(allTraitDefinitions(d).find(x=>x.id===stage).options).find(([,v])=>v==='Favourite')[0];
  d=setTraitValues(d,'r1',{[time]:30,[stage]:fav},make,2200);d=setTraitValues(d,'r2',{[time]:15,[stage]:null},make,2300);
  const rows=queryTraits(d,'shelf',{...traitView(d,'shelf','all'),type});
  const groups=groupTraitRows(d,rows,stage);assert.deepEqual(groups.map(g=>[g.label,g.rows.length]),[['Favourite',1],['Not set',1]]);
  const defs=allTraitDefinitions(d);
  assert.equal(traitSummary(d,rows,defs.find(x=>x.id===time)),'Avg 22.5 · Sum 45');
  assert.equal(traitSummary(d,rows,defs.find(x=>x.id===stage)),'1 of 2 set');
  const csv=traitsCsv(d,rows,[defs.find(x=>x.id===time),defs.find(x=>x.id===stage)]);
  assert.equal(csv,'Note,Cook time (min),Stage\r\nDal tadka,30,Favourite\r\nPoha,15,\r\n');
  const renamed={...d,tables:{...d.tables,bullets:d.tables.bullets.map(x=>x.id==='r1'?{...x,text:'=HYPERLINK("x"), "quoted" #nooktraits'}:x)}};
  const tricky=traitsCsv(renamed,renamed.tables.bullets.filter(x=>x.id==='r1'),[]);
  assert.match(tricky,/^Note\r\n"'=HYPERLINK\(""x""\), ""quoted"""\r\n/,'formulas are neutralised and quotes escaped');
  assert.deepEqual(defaultTraitColumns(d,type),[time,stage]);
  assert.deepEqual(defaultTraitColumns(d,'book'),['nook-book-author','nook-book-status','nook-book-rating']);
});
