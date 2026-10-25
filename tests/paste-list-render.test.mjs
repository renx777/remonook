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
});
