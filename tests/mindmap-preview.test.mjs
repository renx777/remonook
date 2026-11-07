import test from 'node:test';
import assert from 'node:assert/strict';
import {mindmapPreview} from '../src/mindmap-preview.mjs';
import {bullet,index} from '../src/domain.mjs';

test('mindmap snapshots contain actual branches, links and validated styles even if the note root is folded',()=>{
 const nodes=[bullet('map',{text:'Machine Learning',mindmap:true,collapsed:true}),bullet('supervised',{parentId:'map',text:'Supervised learning'}),bullet('regression',{parentId:'supervised',text:'Regression'}),bullet('unsupervised',{parentId:'map',position:1,text:'Unsupervised learning'})];
 const model=mindmapPreview(nodes[0],index(nodes),{supervised:{fill:'#DBEAFE',bold:true,border:'url(https://tracker.test)'}});
 assert.deepEqual(model.nodes.map(n=>n.text),['Machine Learning','Supervised learning','Unsupervised learning','Regression']);
 assert.equal(model.links.length,3);assert.equal(model.nodes.find(n=>n.id==='supervised').style.fill,'#DBEAFE');assert.equal(model.nodes.find(n=>n.id==='supervised').style.border,undefined);
 assert.ok(model.nodes.every(n=>n.x>=0&&n.y>=0&&n.x+n.width<=model.width&&n.y+n.height<=model.height));assert.equal(model.truncated,false);
});

test('large previews are bounded and deterministic, while nested fold state is respected',()=>{
 const nodes=[bullet('map',{text:'Large map',collapsed:true})];for(let i=0;i<1000;i++)nodes.push(bullet('child-'+i,{parentId:'map',position:i,text:'Topic '+i}));
 const idx=index(nodes),one=mindmapPreview(nodes[0],idx),two=mindmapPreview(nodes[0],idx);
 assert.equal(one.nodes.length,25);assert.equal(one.truncated,true);assert.deepEqual(one,two);
 const folded=[bullet('root'),bullet('a',{parentId:'root',collapsed:true}),bullet('b',{parentId:'a'})];assert.equal(mindmapPreview(folded[0],index(folded)).nodes.length,2);
});
