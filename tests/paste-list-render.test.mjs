import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {OutlineView} from './.build/OutlineView.mjs';
import {parseClipboard} from './.build/clipboard.mjs';
import {bullet,pasteOutline} from '../src/domain.mjs';
globalThis.DOMParser=new JSDOM('').window.DOMParser;
test('imported unordered lists render one structural bullet while numbered lists retain numbers',()=>{
  const {lines}=parseClipboard({text:'',html:'<ul><li><span style="color:#777">• Parent</span><ul><li>• Child</li></ul></li></ul><ol><li>1. Numbered</li></ol>'});
  const nodes=pasteOutline([bullet('root')],'root',0,0,lines,['child','numbered']).nodes;
  const noop=()=>{};
  const html=renderToStaticMarkup(React.createElement(OutlineView,{nodes,scope:null,search:'',showCompleted:true,editing:null,caret:null,disabled:false,assets:new Map(),media:[],onEdit:noop,onZoom:noop,onToggle:noop,onChange:noop,onCommand:noop,onOutlinePaste:noop,onReady:noop,onMove:noop,onTask:noop,onMenu:noop}));
  const doc=new JSDOM(html).window.document;
  for(const id of ['root','child']) {
    const row=doc.querySelector(`[data-node-id="${id}"]`);
    assert.equal(row.querySelectorAll('.bullet-dot-btn').length,1);
    assert.equal(row.querySelectorAll('.list-marker').length,0);
    assert.ok(!row.querySelector('.bullet-read-source').textContent.startsWith('•'));
    assert.ok(!row.querySelector('[style*="color:rgb(119"]'));
  }
  assert.equal(doc.querySelector('[data-node-id="numbered"] .list-marker').textContent,'1. ');
  assert.equal(doc.querySelector('[data-node-id="numbered"] .bullet-glyph'),null,'Numbers replace the structural dot');
  assert.equal(doc.querySelector('[data-node-id="numbered"] .row-content .list-marker'),null,'No second marker is embedded in the text');
});

test('numbered parents and children each use one marker and independent sibling numbering, including while editing',()=>{
  const nodes=[bullet('parent',{text:'A',listType:'ORDERED'}),bullet('child-a',{parentId:'parent',text:'Child A',listType:'ORDERED'}),bullet('grandchild',{parentId:'child-a',text:'Grandchild',listType:'ORDERED'}),bullet('child-b',{parentId:'parent',position:1,text:'Child B',listType:'ORDERED'}),bullet('plain',{parentId:'parent',position:2,text:'Unnumbered child'}),bullet('second',{position:1,text:'B',listType:'ORDERED'})];
  const noop=()=>{};
  for(const editing of [null,'child-b']) {
    const html=renderToStaticMarkup(React.createElement(OutlineView,{nodes,scope:null,search:'',showCompleted:true,editing,caret:null,disabled:false,assets:new Map(),media:[],onEdit:noop,onZoom:noop,onToggle:noop,onChange:noop,onCommand:noop,onOutlinePaste:noop,onReady:noop,onMove:noop,onTask:noop,onMenu:noop}));
    const doc=new JSDOM(html).window.document;
    for(const [id,number] of [['parent',1],['child-a',1],['grandchild',1],['child-b',2],['second',2]]) {
      const row=doc.querySelector(`[data-node-id="${id}"]`);
      assert.equal(row.querySelectorAll('.list-marker').length,1);
      assert.equal(row.querySelector('.bullet-dot-btn .list-marker').textContent,`${number}. `);
      assert.equal(row.querySelector('.bullet-glyph'),null);
      assert.equal(row.querySelector('.row-content .list-marker'),null);
    }
    assert.ok(doc.querySelector('[data-node-id="parent"] .triangle-toggle'),'Numbered parents keep their disclosure control');
    assert.ok(doc.querySelector('[data-node-id="plain"] .bullet-glyph'),'Unnumbered children keep their bullet');
    assert.equal(doc.querySelector('[data-node-id="plain"] .list-marker'),null);
  }
});
