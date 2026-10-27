import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {marks,bullet,split,merge} from '../src/domain.mjs';
import {parseRoughStyle,roughStyle} from '../src/rough-annotations.mjs';
import {toEditor,fromEditor,RichRead,unsupportedFormatting} from './.build/editor.mjs';
import {empty,archive,parseArchive,androidBlockers} from './.build/data.mjs';
import {outlineClipboardHtml,parseClipboard} from './.build/clipboard.mjs';
import {seed,sharedState,openShared,applyIntent,project,Y} from '../src/sync-crdt.mjs';

test('annotation styles validate strictly and preserve existing overlapping formatting through editor round trips and split/merge',()=>{
 const node=bullet('a',{text:'hello world',formatting:'0:11:ROUGH_CIRCLE_AUTO;0:5:BOLD;6:11:COLOR_AABBCC'});
 assert.equal(unsupportedFormatting(node),false);const result=fromEditor(toEditor(node));assert.equal(result.text,node.text);assert.deepEqual(marks(result.formatting,result.text.length).sort((a,b)=>a.style.localeCompare(b.style)),marks(node.formatting,node.text.length).sort((a,b)=>a.style.localeCompare(b.style)));
 for(const type of ['circle','box','underline','highlight'])assert.deepEqual(parseRoughStyle(roughStyle(type,'AABBCC')),{type,color:'AABBCC'});
 for(const value of ['ROUGH_CIRCLE_url(x)','ROUGH_SCRIPT_AUTO','ROUGH_CIRCLE_FFF','ROUGH_CIRCLE_123456;0:1:BOLD'])assert.equal(parseRoughStyle(value),null);
 const divided=split([node],'a',5,5,'b');assert.ok(divided.every(n=>marks(n.formatting,n.text.length).some(m=>m.style==='ROUGH_CIRCLE_AUTO')));
 const merged=merge(divided,'b');assert.equal(merged.nodes[0].text,node.text);assert.equal(marks(merged.nodes[0].formatting,node.text.length).filter(m=>m.style==='ROUGH_CIRCLE_AUTO').reduce((n,m)=>n+m.end-m.start,0),11);
});

test('annotations survive full backups and HTML clipboard round trips without copying decorative SVG',async()=>{
 const doc=empty();doc.tables.bullets=[bullet('a',{text:'Remember this',formatting:'0:13:ROUGH_BOX_E88C87;0:8:BOLD'})];
 const restored=await parseArchive(await archive(doc,new Map()));assert.equal(restored.doc.tables.bullets[0].formatting,doc.tables.bullets[0].formatting);assert.ok(androidBlockers(doc).some(x=>/Sketch annotations/.test(x)));
 await assert.rejects(archive(doc,new Map(),true),/full web backup/);
 const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
 const html=outlineClipboardHtml([{...doc.tables.bullets[0],depth:0}]);assert.match(html,/data-remo-rough="box"/);assert.doesNotMatch(html,/<svg/);
 const parsed=parseClipboard({text:'Remember this',html});assert.ok(parsed.lines.some(line=>marks(line.formatting,line.text.length).some(m=>m.style==='ROUGH_BOX_E88C87')));
 const markup=renderToStaticMarkup(React.createElement(RichRead,{node:doc.tables.bullets[0]}));assert.match(markup,/data-remo-rough="box"/);assert.match(markup,/font-weight:650/);assert.doesNotMatch(markup,/ROUGH_BOX_E88C87/);dom.window.close();
});

test('partial annotations preserve rendered equations and emoji source tokens as complete units',()=>{
 const math=bullet('math',{text:'Before $x^2$ after',formatting:'9:10:ROUGH_CIRCLE_AUTO'});
 const markup=renderToStaticMarkup(React.createElement(RichRead,{node:math}));assert.match(markup,/data-selection-source="\$x\^2\$"/);assert.match(markup,/data-remo-rough="circle"/);
 const emoji=bullet('emoji',{text:'Nice :fluent_1f600:!',formatting:'7:10:ROUGH_UNDERLINE_AUTO'});
 assert.match(renderToStaticMarkup(React.createElement(RichRead,{node:emoji})),/:fluent_1f600:/);
});

test('concurrent annotations and text edits converge through the existing rich-text CRDT',()=>{
 const base=empty();base.tables.bullets=[bullet('a',{text:'hello world'})];const initial=seed(base,[]),state=sharedState(initial);initial.destroy();
 const circle=structuredClone(base),underline=structuredClone(base);circle.tables.bullets[0].formatting='0:5:ROUGH_CIRCLE_AUTO';underline.tables.bullets[0].formatting='6:11:ROUGH_UNDERLINE_A7C7E7';underline.tables.bullets[0].text='hello world!';
 const a=openShared(state),b=openShared(state);applyIntent(a,base,circle,[],[]);applyIntent(b,base,underline,[],[]);const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);Y.applyUpdate(a,bb);Y.applyUpdate(b,aa);
 assert.deepEqual(project(a),project(b));const node=project(a).doc.tables.bullets[0];assert.equal(node.text,'hello world!');assert.ok(marks(node.formatting,node.text.length).some(m=>m.style==='ROUGH_CIRCLE_AUTO'));assert.ok(marks(node.formatting,node.text.length).some(m=>m.style==='ROUGH_UNDERLINE_A7C7E7'));a.destroy();b.destroy();
});
