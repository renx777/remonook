import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {applyTool,TOOLS} from '../src/mcp-tools.mjs';
import {handoffPrompt,handoffLinks,HANDOFF_OPERATIONS} from '../src/ai-handoff.mjs';
import {AI_OPERATIONS} from '../src/ai-contract.mjs';

const workspace=()=>{const d=empty();d.tables.bullets=[bullet('ml',{parentId:null,position:0,text:'What are the types of machine learning?'}),bullet('old',{parentId:'ml',position:0,text:'Existing child'})];return d;};

test('every AI assist action can be handed to a connected AI app', () => {
  assert.deepEqual([...AI_OPERATIONS].sort(),[...HANDOFF_OPERATIONS].sort());
  const p=handoffPrompt({operation:'list',question:'names only',bulletId:'ml',title:'<b>Types</b> of ML'});
  assert.match(p,/read_page with id ml/);assert.match(p,/write_notes/);assert.match(p,/Request: names only/);assert.match(p,/"Types of ML"/);
  assert.match(handoffPrompt({operation:'mindmap',bulletId:'ml'}),/write_mindmap with root_id/);
  assert.match(handoffPrompt({operation:'diagram',bulletId:'ml'}),/```mermaid/);
  assert.match(handoffPrompt({operation:'flashcards',bulletId:'ml'}),/create_flashcards/);
  assert.match(handoffPrompt({operation:'answer',mode:'web',bulletId:'ml'}),/web search/);
  assert.throws(()=>handoffPrompt({operation:'list',bulletId:''}));
  const links=handoffLinks('a b&c');assert.deepEqual(links.map(l=>l.app),['Claude','ChatGPT']);assert.ok(links.every(l=>l.href.includes('a%20b%26c')));
  // Every tool the prompts name exists.
  const names=TOOLS.map(t=>t.name);for(const op of HANDOFF_OPERATIONS){const used=handoffPrompt({operation:op,bulletId:'ml'}).match(/\b(?:read|write|create|update)_[a-z_]+\b/g);assert.ok(used.length>=2,op);for(const t of used)assert.ok(names.includes(t),t);}
});

test('write_mindmap turns an existing bullet into a mindmap with nested branches', () => {
  const {doc,result}=applyTool(workspace(),'write_mindmap',{root_id:'ml',markdown:'- Supervised\n  - Classification\n  - Regression\n- Unsupervised\n- Reinforcement'});
  const nodes=doc.tables.bullets,root=nodes.find(n=>n.id==='ml'),kids=nodes.filter(n=>n.parentId==='ml').sort((a,b)=>a.position-b.position);
  assert.equal(root.mindmap,true);
  assert.deepEqual(kids.map(n=>n.text),['Existing child','Supervised','Unsupervised','Reinforcement'],'existing children are kept and branches follow them');
  assert.equal(nodes.filter(n=>n.parentId===kids[1].id).length,2);
  assert.equal(result.ids[0],'ml');assert.match(result.summary,/5 branches/);
});

test('write_mindmap can create a new mindmap and rejects bad input', () => {
  const {doc,result}=applyTool(workspace(),'write_mindmap',{title:'Study plan',parent_id:'ml',markdown:'- Read\n- Practise'});
  const root=doc.tables.bullets.find(n=>n.id===result.ids[0]);
  assert.equal(root.text,'Study plan');assert.equal(root.parentId,'ml');assert.equal(root.mindmap,true);
  assert.equal(doc.tables.bullets.filter(n=>n.parentId===root.id).length,2);
  assert.throws(()=>applyTool(workspace(),'write_mindmap',{markdown:'- A'}),/title or root_id/);
  assert.throws(()=>applyTool(workspace(),'write_mindmap',{root_id:'missing',markdown:'- A'}),/not found/);
  assert.throws(()=>applyTool(workspace(),'write_mindmap',{root_id:'ml',markdown:'   '}),/markdown/);
});
