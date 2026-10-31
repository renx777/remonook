import test from 'node:test';import assert from 'node:assert/strict';
import {preparePaletteNotes,searchPaletteNotes,mergePaletteMatches} from '../src/palette-search.mjs';
test('bounded note search ranks exact matches, supports accent folding, full content and fuzzy previews',()=>{
 const rows=preparePaletteNotes([{id:'fuzzy',text:'Unique idea'},{id:'body',text:'Long note '+'.'.repeat(400)+' café needle in the appendix'},{id:'exact',text:'café needle'},{id:'prefix',text:'Cafe needle workbook'},{id:'blank',text:' '}]);
 assert.deepEqual(searchPaletteNotes(rows,'cafe needle').matches.map(x=>x.id),['exact','prefix','body']);
 assert.equal(searchPaletteNotes(rows,'unq id').matches[0].id,'fuzzy');
 assert.equal(searchPaletteNotes(rows,'appendix cafe').matches[0].id,'body');
 assert.equal(searchPaletteNotes(rows,'totally unavailable').total,0);
 assert.equal(searchPaletteNotes(rows,'').total,4);
});
test('large outlines stay capped, retain stable duplicate ordering and find matches beyond the first page',()=>{
 const rows=preparePaletteNotes([...Array.from({length:20000},(_,i)=>({id:String(i),text:'Common note '+i})),{id:'last',text:'Rare late title'},{id:'duplicate',text:'Rare late title'}]);
 const common=searchPaletteNotes(rows,'common');assert.equal(common.total,20000);assert.equal(common.matches.length,40);assert.deepEqual(common.matches.slice(0,3).map(x=>x.id),['0','1','2']);
 assert.deepEqual(searchPaletteNotes(rows,'rare late title').matches.map(x=>x.id),['last','duplicate']);
 const joined=mergePaletteMatches(searchPaletteNotes(rows.slice(0,10000),'common'),searchPaletteNotes(rows.slice(10000),'common'));assert.deepEqual(joined,common);
});
