import {test} from 'node:test';import assert from 'node:assert/strict';
import {DefaultScheduler,Rating} from 'ts-fsrs';
import {scheduleFsrs,readFsrs,memoryInfo,fsrsSettings,validateFsrs,fsrsInput,readFsrsReview} from '../src/fsrs-scheduler.mjs';
import {bullet,refreshCards} from '../src/domain.mjs';
import {newStudySession,reviewCard,dueCards,intervalLabel,reviewSettings} from '../src/study.mjs';
const now=Date.UTC(2026,10,1,12),day=86400000;
const fresh=()=>refreshCards([bullet('q',{kind:'QUESTION',text:'Question'}),bullet('a',{parentId:'q',text:'Answer'})],[],[],[],now)[0];
const doc=()=>({tables:{cards:[fresh()],bullets:[bullet('q',{kind:'QUESTION',text:'Question'}),bullet('a',{parentId:'q',text:'Answer'})],decks:[],media:[],review_logs:[],study_sessions:[],study_limits:[]},preferences:{study_preferences:{}},web:{}});
const official=await DefaultScheduler({version:'FSRS-6',desiredRetention:.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m'],allowModelOverride:false,enableFuzz:false,maximumInterval:36500});
test('all four ratings and subsequent learning/relearning match the official FSRS-6 scheduler',()=>{
 for(const grade of ['AGAIN','HARD','GOOD','EASY']){
  let local=fresh(),native=official.newCard({now:new Date(now),cardId:'q'}),at=now;
  for(const rating of [grade,'GOOD','GOOD','AGAIN','HARD','GOOD']){
   const expected=official.review({card:native,grade:Rating[rating[0]+rating.slice(1).toLowerCase()],now:new Date(at)});const previous=local,before=structuredClone(local);local=scheduleFsrs(local,rating,at);assert.deepEqual(previous,before);
   const actual=readFsrs(local);assert.deepEqual(actual,expected.card);assert.equal(local.dueAtEpochMillis,expected.card.dueAt.getTime());assert.equal(local.stability,expected.card.stability);assert.equal(local.repetitionCount,expected.card.reps);native=expected.card;at=local.dueAtEpochMillis;
  }
 }
});
test('short-term learning, lapses, recall estimates and interval previews reflect actual scheduling',()=>{
 const c=fresh();assert.equal(intervalLabel(c,'AGAIN',now),'1 min');assert.equal(intervalLabel(c,'GOOD',now),'10 min');
 let learned=scheduleFsrs(c,'EASY',now);assert.equal(memoryInfo(learned,now).state,'Review');assert.ok(memoryInfo(learned,now+day).retrievability<1);
 const lapsed=scheduleFsrs(learned,'AGAIN',learned.dueAtEpochMillis);assert.equal(memoryInfo(lapsed).state,'Relearning');assert.equal(memoryInfo(lapsed).lapses,1);assert.equal(lapsed.dueAtEpochMillis-learned.dueAtEpochMillis,600000);
 assert.equal(lapsed.easeFactor,c.easeFactor,'legacy ease is preserved but is not the FSRS input');assert.equal(memoryInfo(lapsed).reps,2);
 assert.throws(()=>scheduleFsrs(lapsed,'GOOD',now),/clock/);assert.throws(()=>scheduleFsrs(c,'WRONG',now),/grade/);
});
test('migration replays only spaced history and never bulk-reschedules existing due dates',()=>{
 const logs=[{id:1,cardId:'q',mode:'SPACED',grade:'GOOD',reviewedAtEpochMillis:now},{id:2,cardId:'q',mode:'NORMAL',grade:'PRACTICE',reviewedAtEpochMillis:now+100},{id:3,cardId:'q',mode:'SPACED',grade:'EASY',reviewedAtEpochMillis:now+day}];
 const legacy={...fresh(),lastReviewAtEpochMillis:now+day,repetitionCount:2,intervalDays:6,dueAtEpochMillis:now+7*day};const copy=structuredClone(legacy);
 const input=fsrsInput(legacy,now+2*day,{},logs);assert.equal(input.reps,2);assert.equal(input.dueAt.getTime(),legacy.dueAtEpochMillis);assert.deepEqual(legacy,copy);
 const next=scheduleFsrs(legacy,'GOOD',now+7*day,{},logs);assert.ok(next.fsrsState);assert.ok(next.stability>0);assert.equal(next.repetitionCount,3);
 const android={...next,lastReviewAtEpochMillis:now+20*day,intervalDays:12};assert.equal(readFsrs(android),null,'a later legacy review invalidates stale memory state');assert.ok(scheduleFsrs(android,'GOOD',now+32*day).stability>0);
 const incomplete={...legacy,stability:0};assert.equal(fsrsInput(incomplete,now+8*day).stability,6);
});
test('retention defaults, deck overrides and maximum interval affect future reviews without touching current schedules',()=>{
 const d=doc();Object.assign(d.preferences.study_preferences,{fsrsRetention:.95,fsrsMaximumInterval:3});d.tables.decks=[{rootId:'q'}];d.tables.study_limits=[{deckId:'q',newCards:-1,reviewCards:-1,retention:.85}];
 assert.deepEqual(reviewSettings(d,d.tables.cards[0]),{retention:.85,maximumInterval:3});assert.equal(fsrsSettings(d).retention,.95);
 const c=scheduleFsrs(fresh(),'EASY',now);const high=scheduleFsrs(c,'GOOD',c.dueAtEpochMillis,{retention:.97}),low=scheduleFsrs(c,'GOOD',c.dueAtEpochMillis,{retention:.8});assert.ok(high.intervalDays<=low.intervalDays);
 assert.ok(scheduleFsrs(c,'EASY',c.dueAtEpochMillis,{maximumInterval:1}).intervalDays<=1);assert.throws(()=>scheduleFsrs(c,'GOOD',now,{retention:2}));
 assert.throws(()=>validateFsrs({...d,preferences:{study_preferences:{fsrsRetention:NaN}}}));
});
test('spaced state and detailed review logs update together, cram leaves memory untouched, due learning bypasses a spent daily slot',()=>{
 const d=doc();d.tables.study_limits=[{deckId:'__default__',newCards:1,reviewCards:0}];const session={...newStudySession(d,null,'SPACED',now),revealed:1};const reviewed=reviewCard(d,session,'AGAIN',1200,now);
 assert.equal(dueCards(reviewed,null,now).length,0);assert.equal(dueCards(reviewed,null,now+60000).length,1);const log=reviewed.tables.review_logs[0],snapshot=readFsrsReview(log);assert.equal(log.grade,'AGAIN');assert.equal(snapshot.before.state,0);assert.equal(snapshot.after.state,1);assert.equal(log.scheduledNextAtEpochMillis,reviewed.tables.cards[0].dueAtEpochMillis);
 const practice=reviewCard(reviewed,{...newStudySession(reviewed,null,'NORMAL',now),revealed:1},'GOOD',0,now+1);assert.deepEqual(practice.tables.cards,reviewed.tables.cards);assert.equal(practice.tables.review_logs.at(-1).grade,'PRACTICE');assert.equal(practice.tables.review_logs.at(-1).fsrsReview,undefined);
 const secondDevice=reviewCard(d,session,'GOOD',0,now);assert.notEqual(log.id,secondDevice.tables.review_logs[0].id,'offline devices do not overwrite a shared numeric log ID');
});
