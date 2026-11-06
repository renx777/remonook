import {test} from 'node:test';import assert from 'node:assert/strict';import {readTable,tableText,displayCell,insertTableAxis} from '../src/table.mjs';import {mediaLinks} from '../src/media.mjs';
test('table roundtrip, precedence, references, functions and safe errors',()=>{const rows=[['10','2','=A1-B1'],['5','=SUM(A1:A2)','=AVERAGE(A1:A2)'],['=B1*3+2','=MAX(A1:A2)','=MIN(A1:A2)']];assert.deepEqual(readTable(tableText(rows)),rows);assert.equal(displayCell(rows,0,2),'8');assert.equal(displayCell(rows,1,1),'15');assert.equal(displayCell(rows,1,2),'7.5');assert.equal(displayCell(rows,2,0),'8');assert.equal(displayCell([['=A1']],0,0),'#CYCLE!');assert.equal(displayCell([['=1/0']],0,0),'#DIV/0!');assert.equal(displayCell([['=process.exit()']],0,0),'#FORMULA!');assert.equal(displayCell([['=Z99']],0,0),'#REF!');});
test('markdown image embeds and video formats',()=>{assert.equal(mediaLinks('![](https://example.com/photo?id=1)')[0].kind,'image');assert.equal(mediaLinks('![](https://example.com/movie.mp4)')[0].kind,'video');assert.equal(mediaLinks('![](javascript:alert(1))').length,0);});
test('table resizing metadata preserves cells and survives serialization',async()=>{const {tableLayout}=await import('../src/table.mjs');const rows=[['10','=A1*2']];const encoded=tableText(rows,{widths:[220,140],heights:[90]});assert.deepEqual(readTable(encoded),rows);assert.deepEqual(tableLayout(encoded),{widths:[220,140],heights:[90]});assert.equal(displayCell(readTable(encoded),0,1),'20');assert.deepEqual(tableLayout(tableText(rows)),{});});
test('deleting axes shifts formulas and preserves dimensions',async()=>{const {deleteTableAxis}=await import('../src/table.mjs');const rows=[['10','20','=B1-A1'],['4','5','=SUM(A1:A2)']];const next=deleteTableAxis(rows,{widths:[100,200,300]},'column',0);assert.equal(next.rows[0][1],'=A1-#REF!');assert.equal(displayCell(next.rows,0,1),'#REF!');assert.deepEqual(next.layout.widths,[200,300]);assert.deepEqual(deleteTableAxis([['x']],{},'row',0).rows,[['x']]);});

test('inserting a row or column keeps formulas and sizes attached to their cells',()=>{const rows=[['1','=A1*2'],['3','=B1+1']];const col=insertTableAxis(rows,{widths:[100,200]},'column',1);assert.deepEqual(col.rows,[['1','','=A1*2'],['3','','=C1+1']]);assert.deepEqual(col.layout.widths,[100,160,200]);const row=insertTableAxis(rows,{heights:[40,50]},'row',1);assert.deepEqual(row.rows,[['1','=A1*2'],['',''],['3','=B1+1']]);assert.equal(displayCell(row.rows,2,1),'3');assert.deepEqual(row.layout.heights,[40,36,50]);assert.throws(()=>insertTableAxis(rows,{},'row',9));});

test('table formatting: cell, row and column styles resolve, follow moves and survive serialization',async()=>{
 const t=await import('../src/table.mjs');
 let lay=t.styleCells({},0,0,1,1,{bg:'blue',b:true});lay=t.styleAxis(lay,'row',0,{bg:'red'});
 assert.equal(t.cellStyle(lay,0,0).bg,'red','row colour replaces the cell colour it overrides');assert.equal(t.cellStyle(lay,1,1).bg,'blue');
 assert.equal(t.cellStyle({cells:{'0:0':{bg:'#fff'}}},0,0).bg,undefined,'only named colours are accepted');
 const rows=[['Name','N'],['b','2'],['a','=B2*3']];
 const sorted=t.sortTableByColumn(rows,{header:true,cells:{'1:0':{bg:'green'}}},0);
 assert.deepEqual(sorted.rows,[['Name','N'],['a','=B3*3'],['b','2']]);assert.deepEqual(sorted.layout.cells,{'2:0':{bg:'green'}});
 const moved=t.moveTableAxis(rows,{colStyle:[{align:'right'}]},'column',0,1);assert.deepEqual(moved.rows[2],['=A2*3','a']);assert.deepEqual(moved.layout.colStyle,[null,{align:'right'}]);
 const dup=t.duplicateTableAxis(rows,{rowStyle:[null,{bg:'pink'}]},'row',1);assert.equal(dup.rows.length,4);assert.equal(dup.layout.rowStyle[2].bg,'pink');
 const text=t.tableText(rows,{header:true,border:'rows',borderColor:'blue',cells:{'0:1':{fg:'red'}}});assert.deepEqual(t.readTable(text),rows);assert.equal(t.tableLayout(text).borderColor,'blue');
 const ins=t.insertTableAxis(rows,{cells:{'1:0':{b:true}}},'row',0);assert.deepEqual(ins.layout.cells,{'2:0':{b:true}},'formatting moves with its row');assert.deepEqual(t.deleteTableAxis(rows,{rowStyle:[{bg:'red'},null,{bg:'blue'}]},'row',1).layout.rowStyle,[{bg:'red'},{bg:'blue'}]);
});
test('pasting spreadsheet or Markdown grids grows the table within limits',async()=>{
 const t=await import('../src/table.mjs');
 assert.deepEqual(t.parseClipboardGrid('a\tb\nc\td\n'),[['a','b'],['c','d']]);assert.equal(t.parseClipboardGrid('plain'),null);
 assert.deepEqual(t.parseClipboardGrid('| A | B |\n|---|---|\n| 1 | 2 |'),[['A','B'],['1','2']]);
 assert.deepEqual(t.pasteIntoTable([['x']],0,0,[['1','2'],['3','4']]),[['1','2'],['3','4']]);
 assert.equal(t.tableMarkdown([['A','B'],['1','=A2+1']]),'| A | B |\n| --- | --- |\n| 1 | 2 |');
});

test('tags: nested, case-insensitive, related and suggestions; search includes sub-tags',async()=>{
 const t=await import('../src/tags.mjs');const {matchesQuery}=await import('../src/relations.mjs');const {bullet}=await import('../src/domain.mjs');
 const nodes=[bullet('a',{text:'x #Study/ML #imp'}),bullet('b',{text:'y #study/rag'}),bullet('c',{text:'z #study'}),bullet('d',{text:'[[A|b#study]] only a link'})];
 const idx=t.tagIndex(nodes);assert.equal(idx.get('study').count,3);assert.equal(idx.get('study/ml').label,'Study/ML');assert.deepEqual(idx.get('study').children.sort(),['study/ml','study/rag']);
 assert.ok(t.tagMatches('#study/ml','#Study'));assert.ok(!t.tagMatches('#studying','#study'));
 assert.deepEqual(t.relatedTags(nodes,'#study'),[{key:'imp',count:1}]);
 assert.equal(t.tagSuggestions(idx,'ra')[0].key,'study/rag');
 assert.ok(matchesQuery('notes #study/ml','#study'));assert.ok(matchesQuery('notes #STUDY','#study'));assert.ok(!matchesQuery('notes #studying','#study'));
 assert.ok(t.isTagQuery('#a/b'));assert.ok(!t.isTagQuery('#a b'));
});
test('smart tags map to row classes; links and longer words do not count',async()=>{const {smartTagClasses}=await import('../src/relations.mjs');assert.equal(smartTagClasses('Renew passport #done'),'tag-done');assert.equal(smartTagClasses('Learn Rust #Someday'),'tag-later');assert.equal(smartTagClasses('#key idea #private'),'tag-key tag-private');assert.equal(smartTagClasses('#doneness'),'');assert.equal(smartTagClasses('#done/2024'),'');assert.equal(smartTagClasses('see [[x|#done]]'),'');});
