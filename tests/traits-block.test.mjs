import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet,encode,marks} from '../src/domain.mjs';
import {seed,project} from '../src/sync-crdt.mjs';
import {dateOf,dateTraitKeys,calendarMonth,monthGrid,shiftMonth,boardColumns,traitTotal,setNoteTrait,newCollectionItem,traitsFromPreview,applyPreviewTraits,itemLink,addTraitTab,switchTraitTab,renameTraitTab,deleteTraitTab,traitBulletIds,withoutTraits,traitTextByNote,knownTraitNames,ratingOf,ratingText,setTraitValue,groupCollection,traitImageRow,imageTraitNames,parseTraitRow,addTraitsBlock,noteTraits,noteTrait,hasTraitsTag,traitsBlocks,collectionTraitKeys,traitCover,insideTraits,traitView,setTraitView,arrangeCollection,shownTraits} from '../src/traits-block.mjs';

let n=0;const make=()=>'id'+(++n);
const doc=(bullets)=>{const d=empty();return {...d,tables:{...d.tables,bullets}};};
const book=()=>doc([bullet('b',{parentId:null,position:0,text:'A Brief History of Time #Traits'}),bullet('c',{parentId:'b',position:0,text:'Existing child'})]);
/** Types properties into a note's Traits bullet as plain bullets. */
function withTraits(d,id,rows){const r=addTraitsBlock(d,id,make);let nodes=r.doc.tables.bullets.map(x=>x.id===r.row?{...x,text:rows[0]}:x);rows.slice(1).forEach((t,i)=>nodes.push(bullet(make(),{parentId:r.block,position:i+1,text:t})));return {...r.doc,tables:{...r.doc.tables,bullets:nodes}};}

test('#traits (any case) adds a Traits bullet first, with an empty bullet to type into', ()=>{
  const d0=book();assert.ok(hasTraitsTag(d0.tables.bullets[0]));
  const {doc:d,block,row}=addTraitsBlock(d0,'b',make);
  const kids=d.tables.bullets.filter(x=>x.parentId==='b').sort((a,b)=>a.position-b.position);
  assert.deepEqual(kids.map(x=>x.text),['Traits','Existing child']);assert.equal(kids[0].id,block);assert.equal(kids[0].traitsBlock,true);
  assert.equal(d.tables.bullets.find(x=>x.id===row).parentId,block);assert.equal(d.tables.bullets.find(x=>x.id===row).text,'');
  assert.equal(d.tables.bullets.find(x=>x.id==='b').text,'A Brief History of Time');
  const again=addTraitsBlock(d,'b',make);assert.equal(again.block,block,'a second #traits reuses the block');assert.equal(again.row,row,'and its empty bullet');assert.equal(traitsBlocks(again.doc,'b').length,1);
});

test('the tag is removed with formatting kept aligned; code and other tags are left alone', ()=>{
  const n0=bullet('x',{parentId:null,position:0,text:'Bold #traits after',formatting:encode([{start:0,end:4,style:'BOLD'},{start:12,end:18,style:'ITALIC'}])});
  const {doc:d}=addTraitsBlock(doc([n0]),'x',make);const x=d.tables.bullets.find(b=>b.id==='x');
  assert.equal(x.text,'Bold after');assert.deepEqual(marks(x.formatting,x.text.length).map(m=>[m.style,x.text.slice(m.start,m.end)]),[['BOLD','Bold'],['ITALIC','after']]);
  assert.equal(hasTraitsTag(bullet('y',{text:'#traitsy #trait'})),false);
  assert.equal(hasTraitsTag(bullet('z',{text:'x #traits',codeLanguage:'js'})),false);
});

test('#traits on a #views collection only removes the tag; items carry the traits', ()=>{
  const d0=doc([bullet('m',{parentId:null,position:0,text:'Movies #views #traits'})]);const r=addTraitsBlock(d0,'m',make);
  assert.equal(r.block,null);assert.equal(r.doc.tables.bullets.length,1);assert.equal(r.doc.tables.bullets[0].text,'Movies #views');
});

test('properties are plain "Name: value" bullets', ()=>{
  assert.deepEqual(parseTraitRow('Author: Stephen Hawking'),{key:'Author',value:'Stephen Hawking'});
  assert.deepEqual(parseTraitRow('Year:: 1988'),{key:'Year',value:'1988'});
  assert.deepEqual(parseTraitRow('Cover: https://img.test/a.jpg'),{key:'Cover',value:'https://img.test/a.jpg'});
  assert.deepEqual(parseTraitRow('Rating:'),{key:'Rating',value:''});
  assert.equal(parseTraitRow('https://example.com'),null);assert.equal(parseTraitRow('no colon here'),null);assert.equal(parseTraitRow('Time:12'),null);
  const d=withTraits(book(),'b',['Author: Stephen Hawking','just a thought','author: someone else','Pages: 256']);
  assert.deepEqual(noteTraits(d,'b').map(t=>[t.key,t.value,t.duplicate]),[['Author','Stephen Hawking',false],['author','someone else',true],['Pages','256',false]]);
  assert.equal(noteTrait(d,'b','AUTHOR'),'Stephen Hawking');
  const traitBullet=noteTraits(d,'b')[0].id;assert.ok(insideTraits(d,traitBullet));assert.ok(!insideTraits(d,'c'));
});

const shelf=()=>{let d=doc([bullet('p',{parentId:null,position:0,text:'Books #views'}),bullet('t',{parentId:'p',position:0,text:'Time'}),bullet('h',{parentId:'p',position:1,text:'Habits'}),bullet('s',{parentId:'p',position:2,text:'Sapiens'})]);
  d=withTraits(d,'t',['Author: Stephen Hawking','Year: 1988','Poster: https://img.test/time.jpg']);
  d=withTraits(d,'h',['Author: James Clear','Year: 2018','Art: https://img.test/habits.png']);
  return withTraits(d,'s',['Author: Yuval Noah Harari']);};
const items=d=>d.tables.bullets.filter(x=>x.parentId==='p');

test('#views collections sort, filter and pick covers from their items\' traits', ()=>{
  let d=shelf();const keys=collectionTraitKeys(d,['t','h','s']);assert.deepEqual(keys,['Author','Year','Art','Poster']);
  const names=v=>arrangeCollection(d,items(d),{...traitView(d,'p'),...v}).map(x=>x.text);
  assert.deepEqual(names({}),['Time','Habits','Sapiens']);
  assert.deepEqual(names({sort:'Year',dir:'desc'}),['Habits','Time','Sapiens'],'missing values go last');
  assert.deepEqual(names({sort:'title'}),['Habits','Sapiens','Time']);
  assert.deepEqual(names({filterKey:'author',filter:'clear'}),['Habits']);
  assert.deepEqual(names({filter:'harari'}),['Sapiens']);
  assert.equal(traitCover(d,'t'),'https://img.test/time.jpg');assert.equal(traitCover(d,'h'),'https://img.test/habits.png','image links count automatically');
  assert.equal(traitCover(d,'t','Art'),null);assert.equal(traitCover(d,'h','art'),'https://img.test/habits.png');assert.equal(traitCover(d,'t','none'),null);
  d=setTraitView(d,'p',{sort:'Year',fields:['Author']},make,1000);d=setTraitView(d,'p',{dir:'desc'},make,900);
  const tv=traitView(d,'p');assert.deepEqual([tv.fields,tv.sort,tv.dir],[['Author'],'Year','desc'],'later edits win even with an older clock');
  assert.deepEqual(shownTraits(traitView(d,'p'),keys),['Author']);assert.deepEqual(shownTraits(traitView(d,'zz'),keys),keys);
  assert.equal(setTraitView(d,'p',{dir:'desc'},make,2000),d,'no change, no revision');
  d=setTraitView(d,'p',{cardSize:9999,fit:'contain',ratio:1.553},make,3000);const v=traitView(d,'p');assert.deepEqual([v.cardSize,v.fit,v.ratio],[420,'contain',1.55]);
});

test('Traits bullets and view choices survive a sync round trip', ()=>{
  let d=setTraitView(shelf(),'p',{cover:'Poster'},make,1000);
  const root=seed(d),back=project(root).doc;root.destroy();
  assert.equal(back.tables.bullets.filter(x=>x.traitsBlock).length,3);
  assert.equal(noteTrait(back,'t','author'),'Stephen Hawking');assert.equal(traitView(back,'p').cover,'Poster');
});

test('Traits stay out of other views; their values describe the note for search', ()=>{
  const d=shelf(),ids=traitBulletIds(d.tables.bullets);
  assert.equal(ids.size,3+7,'3 Traits bullets and their 7 properties');assert.ok(!ids.has('t'));
  assert.equal(withoutTraits(d.tables.bullets).length,4);
  assert.match(traitTextByNote(d.tables.bullets).get('h'),/James Clear/);
  assert.deepEqual(knownTraitNames(d.tables.bullets).slice(0,2),['Author','Year']);
});

test('ratings show as stars and can be set; other traits are not ratings', ()=>{
  assert.deepEqual(ratingOf('My Rating','4'),{value:4,max:5});assert.deepEqual(ratingOf('Rating','8/10'),{value:8,max:10});
  assert.deepEqual(ratingOf('Stars','★★★☆☆'),{value:3,max:5});assert.deepEqual(ratingOf('Rating',''),{value:0,max:5});
  assert.equal(ratingOf('Year','4'),null);assert.equal(ratingOf('Rating','great'),null);
  assert.equal(ratingText(7,'8/10'),'7/10');assert.equal(ratingText(0,'3'),'');
  let d=withTraits(book(),'b',['Rating:: 3','Author: X']);const row=noteTraits(d,'b')[0].id;
  d=setTraitValue(d,row,'5');assert.equal(d.tables.bullets.find(x=>x.id===row).text,'Rating:: 5','keeps the :: style');
});

test('collections group by a trait, empty last', ()=>{
  const d=shelf();
  const groups=groupCollection(d,items(d),'Author','desc');
  assert.deepEqual(groups.map(g=>[g.label,g.items.map(n=>n.text)]),[['Yuval Noah Harari',['Sapiens']],['Stephen Hawking',['Time']],['James Clear',['Habits']]]);
  assert.deepEqual(groupCollection(d,items(d),'Year').map(g=>g.label),['1988','2018','']);
});

test('an image pasted into a trait bullet can be the cover, by name or automatically', ()=>{
  let d=shelf();const block=traitsBlocks(d,'s')[0].id,img=bullet('img',{parentId:block,position:9,text:'Poster'});
  d={...d,tables:{...d.tables,bullets:[...d.tables.bullets,img],media:[...(d.tables.media||[]),{id:'m1',bulletId:'img',mimeType:'image/png',fileName:'a.png'}]}};
  assert.equal(traitImageRow(d,'s','auto'),'img');assert.equal(traitImageRow(d,'s','poster'),'img');assert.equal(traitImageRow(d,'s','Author'),null);assert.equal(traitImageRow(d,'s','none'),null);
  assert.deepEqual(imageTraitNames(d,['t','h','s']),['Poster']);
});

test('saved views keep their own settings', ()=>{
  let d=shelf();d=setTraitView(d,'p',{sort:'Year'},make,1000);
  const r=addTraitTab(d,'p','Watchlist',make,1100);d=r.doc;let v=traitView(d,'p');
  assert.deepEqual(v.tabs.map(t=>t.name),['All','Watchlist']);assert.equal(v.active,r.tab);assert.equal(v.sort,'Year','a new view copies the current one');
  d=setTraitView(d,'p',{sort:'title',group:'Author'},make,1200);
  d=switchTraitTab(d,'p','all',make,1300);v=traitView(d,'p');assert.deepEqual([v.sort,v.group],['Year','']);
  d=switchTraitTab(d,'p',r.tab,make,1400);v=traitView(d,'p');assert.deepEqual([v.sort,v.group],['title','Author']);
  d=renameTraitTab(d,'p',r.tab,'To watch',make,1500);assert.equal(traitView(d,'p').tabs[1].name,'To watch');
  d=deleteTraitTab(d,'p',r.tab,make,1600);v=traitView(d,'p');assert.deepEqual([v.tabs.length,v.active,v.sort],[1,'all','Year']);
  assert.throws(()=>deleteTraitTab(d,'p','all',make,1700),/at least one/);
});

test('conditions filter with all/any, empty and number comparisons', ()=>{
  const d=shelf(),names=v=>arrangeCollection(d,items(d),{...traitView(d,'p'),...v}).map(x=>x.text);
  assert.deepEqual(names({conditions:[{key:'Year',op:'gt',value:'1990'}]}),['Habits']);
  assert.deepEqual(names({conditions:[{key:'Year',op:'empty',value:''}]}),['Sapiens']);
  assert.deepEqual(names({conditions:[{key:'Year',op:'lt',value:'2000'},{key:'Author',op:'contains',value:'harari'}],match:'any'}),['Time','Sapiens']);
  assert.deepEqual(names({conditions:[{key:'Author',op:'not',value:'clear'},{key:'Year',op:'notempty',value:''}]}),['Time']);
});

test('setting a trait adds the Traits bullet or the trait when missing', ()=>{
  let d=doc([bullet('n',{parentId:null,position:0,text:'Dune'})]);
  d=setNoteTrait(d,'n','Year','2021',make);assert.equal(noteTrait(d,'n','year'),'2021');
  d=setNoteTrait(d,'n','Director','Denis Villeneuve',make);d=setNoteTrait(d,'n','Year','2024',make);
  assert.deepEqual(noteTraits(d,'n').map(t=>t.key+'='+t.value),['Year=2024','Director=Denis Villeneuve']);
});

test('a new collection item lists the collection\'s trait names', ()=>{
  const {doc:d,id}=newCollectionItem(shelf(),'p',['Author','Year'],make);
  assert.equal(d.tables.bullets.find(x=>x.id===id).parentId,'p');assert.deepEqual(noteTraits(d,id).map(t=>[t.key,t.value]),[['Author',''],['Year','']]);
});

test('details from a link fill missing traits and tidy a bare-link title', ()=>{
  assert.deepEqual(traitsFromPreview({title:'Jaws (1975) - IMDb',description:'Directed by Steven Spielberg. With Roy Scheider.',image:'https://img.test/j.jpg',site:'www.imdb.com'}),{title:'Jaws',traits:{Cover:'https://img.test/j.jpg',Year:'1975',Director:'Steven Spielberg',Site:'imdb.com'}});
  assert.equal(traitsFromPreview({title:'Atomic Habits by James Clear | Goodreads',site:'goodreads.com'}).traits.Author,'James Clear');
  let d=doc([bullet('n',{parentId:null,position:0,text:'https://www.imdb.com/title/tt0073195/'})]);
  assert.equal(itemLink(d,'n',d.tables.bullets[0].text),'https://www.imdb.com/title/tt0073195/');
  d=setNoteTrait(d,'n','Year','1976',make);
  d=applyPreviewTraits(d,'n',{title:'Jaws (1975) - IMDb',description:'Directed by Steven Spielberg.',image:'https://img.test/j.jpg',site:'imdb.com'},make);
  assert.equal(d.tables.bullets.find(x=>x.id==='n').text,'Jaws');assert.equal(noteTrait(d,'n','Year'),'1976','never overwrites');
  assert.equal(noteTrait(d,'n','Director'),'Steven Spielberg');assert.equal(noteTrait(d,'n','Link'),'https://www.imdb.com/title/tt0073195/');
});

test('calendar: dates from traits, month grid', ()=>{
  assert.equal(dateOf('2026-11-20'),'2026-11-20');assert.equal(dateOf('20 Nov 2026'),'2026-11-20');assert.equal(dateOf('Nov 20, 2026'),'2026-11-20');
  assert.equal(dateOf('2026-11-20T18:30'),'2026-11-20');assert.equal(dateOf('2026-02-30'),null);assert.equal(dateOf('soon'),null);
  let d=shelf();d=setNoteTrait(d,'t','Watched','2026-11-03',make);d=setNoteTrait(d,'h','Watched','3 Nov 2026',make);d=setNoteTrait(d,'s','Watched','2026-12-01',make);
  assert.deepEqual(dateTraitKeys(d,['t','h','s']),['Watched']);
  const {days,undated}=calendarMonth(d,items(d),'Watched','2026-11');assert.deepEqual([...days.keys()],['2026-11-03']);assert.equal(days.get('2026-11-03').length,2);assert.equal(undated,0);
  const g=monthGrid('2026-11');assert.equal(g.length%7,0);assert.equal(g[0],'2026-10-26','weeks start on Monday');assert.ok(g.includes('2026-11-30'));
  assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});

test('board columns: values in use, extra empty columns, then no value', ()=>{
  let d=shelf();d=setNoteTrait(d,'t','Status','Read',make);d=setNoteTrait(d,'h','Status','Reading',make);
  assert.deepEqual(boardColumns(d,items(d),'Status',['To read']).map(c=>[c.label,c.items.map(n=>n.text)]),[['Read',['Time']],['Reading',['Habits']],['To read',[]],['',['Sapiens']]]);
});

test('table totals', ()=>{
  let d=shelf();d=setNoteTrait(d,'t','Rating','4/5',make);d=setNoteTrait(d,'h','Rating','2',make);
  const list=items(d);
  assert.equal(traitTotal(d,list,'Year','count'),'2');assert.equal(traitTotal(d,list,'Year','empty'),'1');assert.equal(traitTotal(d,list,'Year','min'),'1988');
  assert.equal(traitTotal(d,list,'Rating','avg'),'3');assert.equal(traitTotal(d,list,'Author','unique'),'3');assert.equal(traitTotal(d,list,'Author','sum'),'—');
});
