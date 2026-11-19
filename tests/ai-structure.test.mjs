import test from 'node:test';import assert from 'node:assert/strict';
import {aiPrompt} from '../cloud/ai.mjs';
import {validateAiResult,validateAiInput,structureRows,mermaidSource} from '../src/ai-contract.mjs';
import {insertAi} from '../src/ai-assist.mjs';
import {empty,withNodes} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';

const doc=()=>withNodes(empty(),[bullet('q',{text:'What are the types of machine learning?'}),bullet('old',{text:'Existing',parentId:'q',position:0})]);
const draft=(operation,answer)=>({id:'q',query:'What are the types of machine learning?',answer,updatedAt:1,insertedId:'ins',ai:{operation,mode:'general',context:'What are the types of machine learning?\n  Existing',sourceIds:['q','old'],sourceTexts:[],complete:true}});
const children=(d,id)=>d.tables.bullets.filter(n=>n.parentId===id).sort((a,b)=>a.position-b.position);

test('structure operations are accepted inputs and request JSON from the model',()=>{
 for(const operation of ['list','outline','mindmap','diagram']){
  const input=validateAiInput({operation,mode:'general',question:'Types of ML, names only',context:'Types of ML'});
  const prompt=aiPrompt(input);assert.equal(prompt.structured,true);assert.match(prompt.messages[0].content,/Return JSON only/);
 }
 assert.throws(()=>validateAiInput({operation:'list',mode:'web',question:'x',context:'x'}));
});

test('list replies become one clean line per item, without numbering or Markdown',()=>{
 const r=validateAiResult('list',{items:['1. Supervised Learning','- **Unsupervised Learning**','Semi-supervised Learning','Reinforcement Learning']});
 assert.equal(r.text,'Supervised Learning\nUnsupervised Learning\nSemi-supervised Learning\nReinforcement Learning');
 assert.deepEqual(validateAiResult('list',r),r,'client revalidation accepts the normalized preview');
 assert.throws(()=>validateAiResult('list',{items:[]}));assert.throws(()=>validateAiResult('list',{text:'  '}));
});

test('outline and mindmap replies are bounded and indented; diagrams must be Mermaid',()=>{
 const r=validateAiResult('mindmap',{outline:[{text:'Neural network',children:[{text:'Layers',children:[{text:'Input'},{text:'Hidden'}]},{text:'Training'}]}]});
 assert.equal(r.text,'Neural network\n  Layers\n    Input\n    Hidden\n  Training');
 assert.throws(()=>validateAiResult('outline',{outline:[{text:'a',children:[{text:'b',children:[{text:'c',children:[{text:'d',children:[{text:'e'}]}]}]}]}]}),'depth is limited');
 assert.equal(validateAiResult('diagram',{mermaid:'```mermaid\nflowchart TD\n  A["Input"] --> B["Output"]\n```'}).text,'flowchart TD\n  A["Input"] --> B["Output"]');
 assert.throws(()=>validateAiResult('diagram',{mermaid:'<script>alert(1)</script>'}));
 assert.equal(mermaidSource('hello'),null);
});

test('reviewed rows tolerate tabs, stray indentation and blank lines',()=>{
 assert.deepEqual(structureRows('A\n\n\t\tdeep jump\n  B\nC'),[{depth:0,text:'A'},{depth:1,text:'deep jump'},{depth:1,text:'B'},{depth:0,text:'C'}]);
});

test('a reviewed list adds child bullets after existing children with the insertion identity first',()=>{
 const next=insertAi(doc(),draft('list','Supervised Learning\nUnsupervised Learning\nSemi Supervised Learning\nReinforcement Learning'));
 assert.deepEqual(children(next,'q').map(n=>n.text),['Existing','Supervised Learning','Unsupervised Learning','Semi Supervised Learning','Reinforcement Learning']);
 assert.equal(children(next,'q')[1].id,'ins');
 assert.equal(insertAi(next,draft('list','Again')),next,'a repeated acceptance does not duplicate');
});

test('a reviewed mindmap nests branches and turns the bullet into a mindmap; a diagram adds one Mermaid bullet',()=>{
 const map=insertAi(doc(),draft('mindmap','Layers\n  Input\n  Hidden\nTraining'));
 assert.equal(map.tables.bullets.find(n=>n.id==='q').mindmap,true);
 const layers=children(map,'q').find(n=>n.text==='Layers');assert.deepEqual(children(map,layers.id).map(n=>n.text),['Input','Hidden']);
 const diagram=insertAi(doc(),draft('diagram','flowchart TD\n  A --> B'));
 assert.equal(diagram.tables.bullets.find(n=>n.id==='ins').text,'```mermaid\nflowchart TD\n  A --> B\n```');
 assert.throws(()=>insertAi(doc(),draft('diagram','not a diagram')),/Mermaid/);
});
