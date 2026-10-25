import test from 'node:test';
import assert from 'node:assert/strict';
import {bullet, refreshCards, generatedCards, inferDeckLayout} from '../src/domain.mjs';
import {deckTopics,newStudySession,sessionQueue,reviewCard,saveSession,navigateStudyCard,dueCards,scopedCards} from '../src/study.mjs';
import {configureMcqBranch,answerMcq,mcqAttempt} from '../src/mcq.mjs';
const now=Date.now();
function fixture(){
 const nodes=[bullet('ml',{text:'Machine Learning'}),bullet('f',{parentId:'ml',text:'Foundations',collapsed:true}),bullet('q1',{parentId:'f',text:'What is ML?'}),bullet('a1',{parentId:'q1',text:'Learning from data'}),bullet('q2',{parentId:'f',position:1,text:'What is a model?'}),bullet('a2',{parentId:'q2',text:'A learned function'}),bullet('r',{parentId:'ml',position:1,text:'Regression'}),bullet('q3',{parentId:'r',text:'What is regression?'}),bullet('a3',{parentId:'q3',text:'Predicting numbers'}),bullet('empty',{parentId:'ml',position:2,text:'Coming next'})];
 const decks=[{rootId:'ml',layout:'TOPICS'}];
 return {web:{},tables:{bullets:nodes,decks,cards:refreshCards(nodes,decks,[],[],now),media:[],review_logs:[],study_sessions:[],study_limits:[]}};
}
test('deck topics are containers; selecting a topic limits cards, ignores collapse and preserves order',()=>{
 const doc=fixture();
 assert.equal(inferDeckLayout(doc.tables.bullets,'ml'),'TOPICS');
 assert.deepEqual(generatedCards(doc.tables.bullets,doc.tables.decks).map(c=>c.id),['q1','q2','q3']);
 assert.deepEqual(deckTopics(doc,'ml',now).map(t=>[t.id,t.cards]),[['f',2],['r',1],['empty',0]]);
 const session=newStudySession(doc,'ml','NORMAL',now,Math.random,'f');
 assert.equal(session.topicId,'f');assert.deepEqual(sessionQueue(session),['q1','q2']);
 assert.equal(scopedCards(doc,'ml',now,undefined,'a3').length,0,'Only direct topic children are accepted');
 doc.tables.study_limits=[{deckId:'ml',newCards:1,reviewCards:0}];
 assert.deepEqual(dueCards(doc,'ml',now,undefined,'r').map(c=>c.id),['q3'],'Other topics do not consume the selected topic budget');
});
test('previous and next preserve schedules and never duplicate a graded review, including after JSON reload',()=>{
 let doc=fixture(), session={...newStudySession(doc,'ml','SPACED',now,()=>.99,'f'),revealed:1};
 doc=reviewCard(doc,session,'GOOD',20,now);session=doc.tables.study_sessions[0];
 const scheduled=structuredClone(doc.tables.cards);
 doc=navigateStudyCard(doc,session,'previous',now);session=doc.tables.study_sessions[0];
 assert.equal(session.cursor,0);assert.equal(session.revealed,1);
 doc=JSON.parse(JSON.stringify(doc));session=doc.tables.study_sessions[0];
 doc=reviewCard(doc,session,'AGAIN',20,now);session=doc.tables.study_sessions[0];
 assert.equal(session.cursor,1);assert.equal(doc.tables.review_logs.length,1);assert.deepEqual(doc.tables.cards,scheduled);
 assert.equal(navigateStudyCard(doc,session,'next',now),doc,'Cannot advance an unrevealed question');
 doc=navigateStudyCard(doc,{...session,revealed:1},'next',now);
 assert.deepEqual(doc.tables.cards,scheduled,'Touch navigation does not infer a spaced rating');
 assert.equal(doc.tables.review_logs.length,1);
});
test('MCQ topic queues keep options attached and revisiting retains the first attempt',()=>{
 let doc=fixture();doc.tables.decks=[];doc.tables.cards=[];
 doc.tables.bullets=doc.tables.bullets.filter(n=>!n.id.startsWith('a'));
 for(const id of ['q1','q2','q3']) for(let i=0;i<4;i++)doc.tables.bullets.push(bullet(id+'o'+i,{parentId:id,position:i,text:i===2?'Correct @Answer':'Other '+i}));
 doc=configureMcqBranch(doc,'ml',now);
 doc.tables.cards=refreshCards(doc.tables.bullets,[],[],[],now);
 assert.equal(doc.tables.decks[0].layout,'TOPICS');
 assert.deepEqual(deckTopics(doc,'ml',now).map(t=>[t.id,t.cards]),[['f',2],['r',1],['empty',0]]);
 let session={...newStudySession(doc,'ml','NORMAL',now,Math.random,'f'),tag:'topic-quiz'};
 doc=saveSession(doc,session);doc=answerMcq(doc,session,'q1o2',now);session=doc.tables.study_sessions[0];
 doc=reviewCard(doc,session,'GOOD',20,now);session=doc.tables.study_sessions[0];
 doc=navigateStudyCard(doc,session,'previous',now);session=doc.tables.study_sessions[0];
 assert.equal(mcqAttempt(doc,session).choiceId,'q1o2');
 assert.equal(answerMcq(doc,session,'q1o0',now),doc);
 assert.deepEqual(sessionQueue(session),['q1','q2']);
});
